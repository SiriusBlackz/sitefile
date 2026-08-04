import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { writeFileSync } from "fs";

async function main() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Sample Programme — Acme Construction Ltd.", { x: 50, y: 800, size: 14, font });
  const rows = [
    "WBS    Task                          Start         End          %",
    "1      Site preparation              01/05/2026    14/05/2026   100",
    "1.1    Survey & marking              01/05/2026    03/05/2026   100",
    "1.2    Hoarding install              04/05/2026    07/05/2026   100",
    "2      Substructure                  15/05/2026    12/06/2026    35",
    "2.1    Excavation                    15/05/2026    22/05/2026   100",
    "2.2    Foundations RC                23/05/2026    05/06/2026    60",
    "3      Superstructure                13/06/2026    15/08/2026     0",
  ];
  rows.forEach((row, i) => page.drawText(row, { x: 50, y: 760 - i * 20, size: 10, font }));
  const bytes = await pdf.save();
  writeFileSync("/tmp/sample-programme.pdf", bytes);
  console.log("wrote /tmp/sample-programme.pdf");
}
main();
