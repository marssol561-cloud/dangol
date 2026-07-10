import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/auth.server';
import { getServerClient } from '@/lib/dangolDb';
import QRCode from 'qrcode';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const QR_BASE_URL = 'https://dangol.revum.net/r';

export async function GET(request: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code 파라미터 필요' }, { status: 400 });
  }

  // Verify the store_code belongs to the caller
  const db = getServerClient();
  const { data: link, error: fetchErr } = await db
    .from('store_links')
    .select('store_code, store_name')
    .eq('store_code', code)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (fetchErr || !link) {
    return NextResponse.json({ error: '매장 정보를 찾을 수 없습니다' }, { status: 404 });
  }

  const qrUrl = `${QR_BASE_URL}/${link.store_code}`;

  // Generate QR as PNG buffer
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  // Build PDF
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([400, 520]);
  const fontBoldBytes = fs.readFileSync(path.join(process.cwd(), 'app/api/qr/fonts/Pretendard-Bold.ttf'));
  const fontRegBytes = fs.readFileSync(path.join(process.cwd(), 'app/api/qr/fonts/Pretendard-Regular.ttf'));
  const font = await pdf.embedFont(fontBoldBytes, { subset: false });
  const fontReg = await pdf.embedFont(fontRegBytes, { subset: false });

  // Title
  page.drawText('리붐단골', {
    x: 120,
    y: 480,
    size: 28,
    font,
    color: rgb(0.07, 0.47, 0.44),
  });

  // Store name
  const storeName = link.store_name ?? code;
  page.drawText(storeName, {
    x: 50,
    y: 445,
    size: 16,
    font,
    color: rgb(0.1, 0.1, 0.1),
    maxWidth: 300,
  });

  // QR image
  const qrImage = await pdf.embedPng(qrBuffer);
  page.drawImage(qrImage, { x: 75, y: 120, width: 250, height: 250 });

  // Instruction
  page.drawText('QR을 스캔해 단골 혜택을 받으세요', {
    x: 70,
    y: 95,
    size: 12,
    font: fontReg,
    color: rgb(0.3, 0.3, 0.3),
  });

  // URL hint
  page.drawText(qrUrl, {
    x: 50,
    y: 65,
    size: 9,
    font: fontReg,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Store code
  page.drawText(`코드: ${link.store_code}`, {
    x: 50,
    y: 45,
    size: 10,
    font: fontReg,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdf.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dangol-qr-${link.store_code}.pdf"`,
    },
  });
}
