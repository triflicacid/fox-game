// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty until constants are migrated onto it
export interface ConstantsSchema {}

/**
 * Every dotted path reachable through `T`, e.g. `"a.b.c"` for
 * `{ a: { b: { c: number } } }`.
 *
 * @example ```ts
 * type Config = {
 *     server: {
 *         host: string;
 *         port: number;
 *     };
 *     debug: boolean;
 * };
 *
 * type Paths = DotPath<Config>; // "server.host" | "server.port" | "debug"
 * ```
 */
export type DotPath<T, Prefix extends string = ""> = {
    [K in keyof T & string]: T[K] extends object
        ? DotPath<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
}[keyof T & string];

/**
 * The value type found at dotted path `P` within `T`.
 *
 * @example ```ts
 * type Config = {
 *     server: {
 *         host: string;
 *         port: number;
 *     };
 *     debug: boolean;
 * };
 *
 * type Host = ValueAt<Config, "server.host">; // string
 * type Port = ValueAt<Config, "server.port">; // number
 * type Debug = ValueAt<Config, "debug">; // boolean
 * ```
 */
export type ValueAt<T, P extends string> =
    P extends `${infer Head}.${infer Rest}`
        ? Head extends keyof T ? ValueAt<T[Head], Rest> : never
        : P extends keyof T ? T[P] : never;
