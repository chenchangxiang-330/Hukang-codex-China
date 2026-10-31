/** TEST ONLY: chosen preview image; never requests any external image URL. */
export async function readMealImage(uri: string) {
  if (uri !== "/assets/archived-milk.jpg")
    throw new Error("Preview image only");
  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { base64: btoa(binary), mime: "image/jpeg" as const };
}
