/**
 * The shape every locale must fill.
 *
 * `as const` on the English dictionary gives each string a literal type, which
 * is what makes a mistyped key a compile error - but it would also demand that
 * the French repeat the English words. This widens the leaves back to `string`
 * while keeping the key structure exact, so French must supply every key and
 * may supply any text.
 */
export type Translated<T> = {
  [K in keyof T]: T[K] extends string ? string : Translated<T[K]>;
};
