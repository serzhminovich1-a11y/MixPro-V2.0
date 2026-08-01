import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toast } from "sonner";

type Props = {
  courseTitle: string;
  studentName: string;
  completedAt?: string | null;
  certificateSlug?: string; // internal ID for the verification code
};

/**
 * Generates a certificate PDF entirely in the browser via pdf-lib.
 * No server round-trip: signals of trust are the QR-code-friendly cert ID
 * and the completion timestamp derived from the DB.
 */
export function CertificateButton({ courseTitle, studentName, completedAt, certificateSlug }: Props) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([842, 595]); // A4 landscape
      const { width, height } = page.getSize();
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const body = await pdf.embedFont(StandardFonts.Helvetica);
      const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

      // Background
      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.05, 0.05, 0.06) });
      // Ornamental border
      page.drawRectangle({
        x: 30, y: 30, width: width - 60, height: height - 60,
        borderColor: rgb(0.35, 0.9, 0.65), borderWidth: 2, color: rgb(0.07, 0.07, 0.08),
      });
      page.drawRectangle({
        x: 40, y: 40, width: width - 80, height: height - 80,
        borderColor: rgb(0.25, 0.7, 0.5), borderWidth: 0.5,
      });

      // Brand
      page.drawText("MIXPRO", { x: width / 2 - 40, y: height - 90, size: 22, font, color: rgb(0.35, 0.95, 0.7) });
      page.drawText("audio engineer academy", { x: width / 2 - 78, y: height - 110, size: 9, font: italic, color: rgb(0.7, 0.7, 0.7) });

      // Title
      const title = "СЕРТИФИКАТ О ПРОХОЖДЕНИИ";
      const tw = font.widthOfTextAtSize(title, 26);
      page.drawText(title, { x: (width - tw) / 2, y: height - 170, size: 26, font, color: rgb(0.95, 0.95, 0.95) });

      // Subtitle
      const sub = "Настоящим подтверждается, что";
      const sw = body.widthOfTextAtSize(sub, 12);
      page.drawText(sub, { x: (width - sw) / 2, y: height - 210, size: 12, font: body, color: rgb(0.75, 0.75, 0.75) });

      // Student name
      const nw = font.widthOfTextAtSize(studentName, 32);
      page.drawText(studentName, { x: (width - nw) / 2, y: height - 260, size: 32, font, color: rgb(0.4, 0.95, 0.75) });

      // Underline
      page.drawLine({
        start: { x: width / 2 - Math.max(nw, 200) / 2 - 20, y: height - 275 },
        end: { x: width / 2 + Math.max(nw, 200) / 2 + 20, y: height - 275 },
        thickness: 0.8, color: rgb(0.35, 0.9, 0.65),
      });

      const line2 = "успешно завершил(а) курс";
      const l2w = body.widthOfTextAtSize(line2, 12);
      page.drawText(line2, { x: (width - l2w) / 2, y: height - 305, size: 12, font: body, color: rgb(0.75, 0.75, 0.75) });

      const cw = font.widthOfTextAtSize(courseTitle, 22);
      page.drawText(courseTitle, { x: (width - cw) / 2, y: height - 340, size: 22, font, color: rgb(0.95, 0.95, 0.95) });

      // Meta row
      const dateStr = completedAt ? new Date(completedAt).toLocaleDateString("ru-RU") : new Date().toLocaleDateString("ru-RU");
      const certId = (certificateSlug ?? crypto.randomUUID()).slice(0, 12).toUpperCase();
      page.drawText(`Дата: ${dateStr}`, { x: 90, y: 90, size: 10, font: body, color: rgb(0.7, 0.7, 0.7) });
      page.drawText(`ID сертификата: ${certId}`, { x: 90, y: 72, size: 10, font: body, color: rgb(0.7, 0.7, 0.7) });
      page.drawText("MixPro Academy", { x: width - 220, y: 90, size: 10, font, color: rgb(0.35, 0.95, 0.7) });
      page.drawText("подпись: цифровая", { x: width - 220, y: 72, size: 9, font: italic, color: rgb(0.55, 0.55, 0.55) });

      const bytes = await pdf.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mixpro-certificate-${certId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Сертификат скачан");
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось создать PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={generate}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-mint/50 bg-mint/10 px-4 py-2 text-sm font-semibold text-mint transition-colors hover:bg-mint/20 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Скачать сертификат PDF
    </button>
  );
}
