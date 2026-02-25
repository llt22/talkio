declare module "@ungap/structured-clone" {
  const structuredClone: <T>(value: T, options?: StructuredSerializeOptions) => T;
  export default structuredClone;
}

declare module "react-native/Libraries/Utilities/PolyfillFunctions" {
  export function polyfillGlobal(name: string, getValue: () => any): void;
}

declare module "@stardazed/streams-text-encoding" {
  export class TextEncoderStream extends TransformStream<string, Uint8Array> {}
  export class TextDecoderStream extends TransformStream<Uint8Array, string> {}
}
