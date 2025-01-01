/**
 * @internal
 *
 * A utility type that recursively makes all properties of an object, including nested objects, optional. This should only be used on JSON objects only. Otherwise,
 * you're going to end up with class methods marked as optional as well. Credit for this belongs to: https://github.com/joonhocho/tsdef.
 *
 * @template T - The type to make recursively partial.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer I> ? Array<DeepPartial<I>> : DeepPartial<T[P]>;
};
/**
 * @internal
 *
 * A utility type that recursively makes all properties of an object, including nested objects, optional. This should only be used on JSON objects only. Otherwise,
 * you're going to end up with class methods marked as optional as well. Credit for this belongs to: https://github.com/joonhocho/tsdef.
 *
 * @template T - The type to make recursively partial.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends Array<infer I> ? Array<DeepReadonly<I>> : DeepReadonly<T[P]>;
};
/**
 * @internal
 *
 * A utility type that makes a given type assignable to it's type or null.
 */
export type Nullable<T> = T | null;

