"""Saved listings - a signed-in user's bookmarks.

    GET    /favorites                 the caller's saved listings, newest first
    PUT    /favorites/{business_id}   save one (idempotent)
    DELETE /favorites/{business_id}   unsave one (idempotent)

Only publicly visible listings can be saved, and only publicly visible ones
are listed: a saved listing that is later paused or suspended keeps its row
(so it comes back if the listing does) but is not shown, because showing it
would leak a hidden listing through a side door - the rule every public route
follows, app/core/visibility.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.visibility import require_visible_business, visible_businesses
from app.models.business import Business
from app.models.category import Category
from app.models.favorite import Favorite
from app.models.user import User
from app.schemas.directory import FavoriteOut

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=list[FavoriteOut])
def list_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FavoriteOut]:
    rows = db.execute(
        visible_businesses(
            Business.id,
            Business.slug,
            Business.name,
            Business.city,
            Business.province,
            Business.phone,
            Business.rating,
            Business.review_count,
            Category.slug.label("category_slug"),
            Category.name.label("category_name"),
            Favorite.created_at.label("saved_at"),
        )
        .join(Category, Category.id == Business.category_id)
        .join(Favorite, Favorite.business_id == Business.id)
        .where(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc(), Business.id.desc())
    ).mappings().all()

    return [
        FavoriteOut(business_id=row["id"], **{k: v for k, v in row.items() if k != "id"})
        for row in rows
    ]


@router.put("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
def save_favorite(
    business_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Save a listing. Saving one already saved is not an error."""
    require_visible_business(db, business_id)
    db.execute(
        insert(Favorite)
        .values(user_id=current_user.id, business_id=business_id)
        .on_conflict_do_nothing(index_elements=["user_id", "business_id"])
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    business_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Unsave a listing. No visibility check: a hidden listing can still be let go."""
    db.execute(
        delete(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.business_id == business_id,
        )
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
