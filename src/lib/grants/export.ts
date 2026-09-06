import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
  Footer,
  PageNumber,
  AlignmentType,
} from "docx";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { RequestError } from "@/lib/record-policy";
import { snapshot } from "./projects";
import { hash } from "./access";
export type ProposalSnapshot = Awaited<ReturnType<typeof snapshot>>;
type Line = { text: string; heading?: boolean; gap?: boolean };
export async function exportProposal(
  content: ProposalSnapshot,
  approved = false,
) {
  const contentHash = hash(content),
    money = (n: number) => `${content.currency} ${(n / 100).toFixed(2)}`;
  const lines: Line[] = [
    { text: content.title, heading: true },
    {
      text: approved
        ? "Approved package · submission requires a separate receipt"
        : "DRAFT · NOT APPROVED OR SUBMITTED",
    },
    { text: `Funder: ${content.funder}` },
    { text: `Program: ${content.program}` },
    { text: `Deadline: ${content.dueAt ?? "Not configured"}` },
    { text: `Content SHA-256: ${contentHash}` },
    { text: "Contents", heading: true },
    ...content.document.sections.map((s, i) => ({
      text: `${i + 1}. ${s.title}`,
    })),
    { text: "Budget and justification" },
    { text: "References" },
    { text: "Organization", heading: true },
    { text: content.document.organizationNarrative },
  ];
  for (const [index, section] of content.document.sections.entries()) {
    lines.push(
      { text: `${index + 1}. ${section.title}`, heading: true },
      { text: section.content },
    );
    for (const cite of section.citations) {
      const source = content.sources.find((s) => s.id === cite.sourceId),
        chunk = (
          source?.chunks as { id: string; label: string }[] | undefined
        )?.find((c) => c.id === cite.chunkId);
      lines.push({
        text: `Source: ${source?.title ?? cite.sourceId}, ${chunk?.label ?? cite.chunkId}. “${cite.quote}”`,
      });
    }
  }
  lines.push({ text: "Budget and justification", heading: true });
  for (const row of content.document.budget) {
    const totals = content.budget.rows.find((r) => r.id === row.id)!;
    lines.push(
      {
        text: `Year ${row.year} · ${row.category} · ${row.description}`,
        heading: true,
      },
      {
        text: `Quantity ${row.quantity} × rate ${row.unitRate} × effort ${(row.effortBps / 100).toFixed(2)}%; base ${money(totals.baseCents)}; fringe ${money(totals.fringeCents)}; indirect ${money(totals.indirectCents)}; cost share ${money(totals.costShareCents)}; requested ${money(totals.requestedCents)}`,
      },
      { text: row.justification },
    );
  }
  lines.push(
    {
      text: `Total: ${money(content.budget.totalCents)} · Cost share: ${money(content.budget.costShareCents)} · Requested: ${money(content.budget.requestedCents)}`,
      heading: true,
    },
    { text: "References", heading: true },
  );
  const used = new Set([
    ...content.document.sections.flatMap((s) =>
      s.citations.map((c) => c.sourceId),
    ),
    ...content.document.requirements.flatMap((r) =>
      r.citations.map((c) => c.sourceId),
    ),
    ...content.document.budget.flatMap((b) =>
      b.policyCitation ? [b.policyCitation.sourceId] : [],
    ),
  ]);
  for (const source of content.sources.filter((s) => used.has(s.id)))
    lines.push({
      text: `${source.title} · ${source.fileName} · SHA-256 ${source.contentHash} · independent review ${source.approvedBy ?? "pending"}`,
    });
  const paragraphs: Paragraph[] = lines.flatMap((line) =>
    line.text.split("\n").map(
      (text) =>
        new Paragraph({
          heading: line.heading ? HeadingLevel.HEADING_1 : undefined,
          spacing: { after: line.heading ? 220 : 120 },
          children: [
            new TextRun({
              text,
              size: line.heading ? 30 : 22,
              bold: line.heading,
            }),
          ],
        }),
    ),
  );
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ["Year", "Total", "Cost share", "Requested"],
      ...content.budget.years.map((y) => [
        String(y.year),
        money(y.totalCents),
        money(y.totalCents - y.requestedCents),
        money(y.requestedCents),
      ]),
    ].map(
      (values, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: values.map(
            (text) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text, bold: i === 0 })],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
  const doc = new Document({
    creator: "Proposal & Grant Development Workspace",
    title: content.title,
    description: `Frozen content ${contentHash}`,
    styles: { default: { document: { run: { font: "Noto Sans", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: ["Page ", PageNumber.CURRENT] }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...paragraphs,
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            text: "Budget by year",
          }),
          table,
        ],
      },
    ],
  });
  const docx = await Packer.toBuffer(doc);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontFile = process.env.GRANT_PDF_FONT_FILE ?? "NotoSans.woff";
  if (!/^[a-zA-Z0-9_.-]+\.(woff|ttf|otf)$/.test(fontFile))
    throw new RequestError(
      "GRANT_PDF_FONT_FILE must name a font in assets/grant-fonts",
    );
  const fontBytes = await readFile(
    path.join(process.cwd(), "assets/grant-fonts", fontFile),
  );
  const font = await pdfDoc.embedFont(fontBytes, { subset: true }),
    supported = new Set(font.getCharacterSet());
  let page = pdfDoc.addPage([612, 792]),
    y = 738;
  const pageBreak = () => {
    page = pdfDoc.addPage([612, 792]);
    y = 738;
    if (pdfDoc.getPageCount() > 200)
      throw new RequestError("Proposal export exceeds 200 pages");
  };
  for (const line of lines) {
    const size = line.heading ? 14 : 10.5,
      height = line.heading ? 21 : 16;
    if (line.heading) y -= 10;
    for (const paragraph of line.text.split("\n")) {
      let current = "";
      const flush = () => {
        if (y < 60) pageBreak();
        page.drawText(current, {
          x: 54,
          y,
          size,
          font,
          color: rgb(0.12, 0.16, 0.22),
        });
        y -= height;
        current = "";
      };
      for (const character of Array.from(paragraph.replace(/\t/g, "    "))) {
        if (!supported.has(character.codePointAt(0)!))
          throw new RequestError(
            "The configured PDF font cannot represent every character. Configure GRANT_PDF_FONT_FILE with a compatible font before exporting.",
          );
        if (font.widthOfTextAtSize(current + character, size) > 504) flush();
        current += character;
      }
      flush();
    }
    y -= 6;
  }
  for (const [i, p] of pdfDoc.getPages().entries())
    p.drawText(`${i + 1} / ${pdfDoc.getPageCount()}`, {
      x: 285,
      y: 28,
      size: 9,
      font,
    });
  pdfDoc.setTitle(content.title);
  pdfDoc.setCreator("Proposal & Grant Development Workspace");
  pdfDoc.setSubject(`Content SHA-256 ${contentHash}`);
  const pdf = Buffer.from(await pdfDoc.save());
  return { docx, pdf, contentHash, pageCount: pdfDoc.getPageCount() };
}
export const bytesHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function packageProposal(
  content: ProposalSnapshot,
  attachments: {
    id: string;
    fileName: string;
    bytes: Uint8Array;
    contentHash: string;
  }[],
  reviewIds: string[],
) {
  const files = await exportProposal(content, true);
  if (attachments.reduce((sum, a) => sum + a.bytes.length, 0) > 20000000)
    throw new RequestError("Attachments exceed 20 MB");
  const archive = new JSZip(),
    manifest = {
      formatVersion: 1,
      projectVersion: content.projectVersion,
      contentHash: files.contentHash,
      createdAt: new Date().toISOString(),
      pageCount: files.pageCount,
      currency: content.currency,
      budget: content.budget,
      reviewIds,
      files: [
        { name: "proposal.docx", sha256: bytesHash(files.docx) },
        { name: "proposal.pdf", sha256: bytesHash(files.pdf) },
        ...attachments.map((a) => ({
          name: `attachments/${a.id}-${a.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
          sha256: a.contentHash,
        })),
      ],
      sources: content.sources.map((s) => ({
        id: s.id,
        title: s.title,
        sha256: s.contentHash,
        approvedBy: s.approvedBy,
      })),
    };
  archive.file("proposal.docx", files.docx);
  archive.file("proposal.pdf", files.pdf);
  archive.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const [i, attachment] of attachments.entries())
    archive.file(manifest.files[i + 2].name, attachment.bytes);
  return {
    ...files,
    manifest,
    archive: await archive.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }),
  };
}
