import { PDFDocument, PDFHeader } from "@cantoo/pdf-lib";
import crypto from "crypto";

/**
 * Encrypts a finished PDF with a user password (AES-256).
 *
 * The fork selects the cipher from the PDF header version: Puppeteer emits
 * %PDF-1.4 (which would pick RC4-128), so the header is forced to
 * "1.7ext3" — the same nonconforming-but-universally-tolerated header
 * pdfkit has shipped for years for its AES-256 mode. If a viewer ever
 * chokes on it, dropping to `PDFHeader.forVersion(1, 7)` selects AES-128
 * with a spec-valid header.
 */
export async function encryptPdfBuffer(
  pdf: Buffer,
  userPassword: string
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  doc.context.header = PDFHeader.forVersion(1, "7ext3" as unknown as number);
  doc.encrypt({
    userPassword,
    // The owner password (full-permissions unlock) is never stored or
    // shown anywhere; recipients only ever use the user password.
    ownerPassword: crypto.randomBytes(32).toString("hex"),
    permissions: { printing: "highResolution", copying: true },
  });
  return Buffer.from(await doc.save());
}
