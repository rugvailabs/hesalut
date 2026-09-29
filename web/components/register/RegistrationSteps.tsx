/**
 * The progress bar across the top of /register, and its back/next navigation.
 *
 * Every step the owner has already reached is a link, so they can go back to
 * change their details or their plan and come forward again without losing
 * anything - it is all saved server-side as they go. Steps not reached yet are
 * plain text: the page decides how far someone may go from what they have
 * actually saved, never from a click here. Once registration is complete the
 * earlier steps are closed, because nothing on them can change any more.
 */

import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";

/** Dictionary keys under register.steps, in step order. */
export const STEP_LABELS = ["details", "plan", "payment", "done"] as const;

export default function RegistrationSteps({
  current,
  furthest,
  completed,
  locale,
}: {
  /** The step on screen, 1-4. */
  current: number;
  /** The furthest step reached, 1-4. */
  furthest: number;
  completed: boolean;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const percent = Math.round(((completed ? 4 : current) - 1) / 3 * 100);

  return (
    <nav aria-label={t("register.steps.progress")}>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-line"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={completed ? 4 : current}
        aria-valuetext={t("register.stepOf", { step: completed ? 4 : current })}
      >
        <div
          className="h-full rounded-pill bg-brand-700 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-3 grid grid-cols-4 gap-2">
        {STEP_LABELS.map((key, index) => {
          const step = index + 1;
          const label = t(`register.steps.${key}`);
          const isCurrent = !completed && step === current;
          // Everything before the furthest step has been saved.
          const done = !isCurrent && (completed || step < furthest);
          const reachable = !completed && step <= furthest && step !== current;

          const marker = (
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold tabular",
                done && "bg-brand-700 text-ink-inverse",
                isCurrent && "border-2 border-brand-700 bg-surface text-brand-800",
                !done && !isCurrent && "border border-line-strong bg-surface text-ink-muted",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="size-4" /> : step}
            </span>
          );
          const text = (
            <span
              className={cn(
                "hidden truncate text-meta sm:block",
                isCurrent ? "font-semibold text-ink" : "text-ink-muted",
              )}
            >
              {label}
            </span>
          );
          const status = done
            ? t("register.steps.statusComplete")
            : isCurrent
              ? t("register.steps.statusCurrent")
              : t("register.steps.statusNotStarted");

          return (
            <li key={key} aria-current={isCurrent ? "step" : undefined} className="min-w-0">
              {reachable ? (
                <Link
                  href={`/register?step=${step}`}
                  className="flex min-w-0 items-center gap-2 rounded-input hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {marker}
                  {text}
                  <span className="sr-only">{t("register.steps.srLink", { step, label, status })}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  {marker}
                  {text}
                  <span className="sr-only">{t("register.steps.srText", { step, label, status })}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
