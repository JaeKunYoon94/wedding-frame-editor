'use client';

import { useState } from 'react';
import { PAPER_SIZES, validateCustomSize } from '@/lib/paperSizes';
import { useEditorStore } from '@/stores/editorStore';
import type { BleedMm, GutterMm, LayoutType } from '@/types';
import { canExportOnDevice } from '@/lib/exportPdf';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-stone-200 p-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500">{title}</h3>
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
      }`}
    >
      {children}
    </button>
  );
}

export default function SettingsPanel({ onExport }: { onExport: (format: 'png' | 'jpg' | 'pdf') => void }) {
  const s = useEditorStore();
  const [customW, setCustomW] = useState('210');
  const [customH, setCustomH] = useState('297');
  const [customError, setCustomError] = useState<string | null>(null);

  const applyCustom = () => {
    const w = Number(customW);
    const h = Number(customH);
    const err = validateCustomSize(w, h);
    setCustomError(err);
    if (!err) s.setPaper('custom', { w, h });
  };

  const exportable = canExportOnDevice(s.widthMm + s.bleedMm * 2, s.heightMm + s.bleedMm * 2);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section title="용지">
        <div className="flex flex-wrap gap-1.5">
          {PAPER_SIZES.map((p) => (
            <Chip key={p.id} active={s.paperId === p.id} onClick={() => s.setPaper(p.id)}>
              {p.label}
            </Chip>
          ))}
          <Chip active={s.paperId === 'custom'} onClick={applyCustom}>
            Custom
          </Chip>
        </div>
        {s.paperId === 'custom' || customError ? (
          <div className="mt-2 flex items-center gap-1.5 text-sm">
            <input
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              className="w-16 rounded border border-stone-300 px-2 py-1"
              inputMode="numeric"
            />
            ×
            <input
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              className="w-16 rounded border border-stone-300 px-2 py-1"
              inputMode="numeric"
            />
            <span className="text-stone-400">mm</span>
            <button onClick={applyCustom} className="ml-1 rounded bg-stone-800 px-2 py-1 text-xs text-white">
              적용
            </button>
          </div>
        ) : null}
        {customError && <p className="mt-1 text-xs text-red-600">{customError}</p>}
        <div className="mt-2 flex gap-1.5">
          <Chip active={s.orientation === 'portrait'} onClick={() => s.orientation !== 'portrait' && s.toggleOrientation()}>
            세로
          </Chip>
          <Chip active={s.orientation === 'landscape'} onClick={() => s.orientation !== 'landscape' && s.toggleOrientation()}>
            가로
          </Chip>
        </div>
      </Section>

      <Section title="레이아웃">
        <div className="flex gap-1.5">
          {([1, 2, 4, 6] as LayoutType[]).map((n) => (
            <Chip key={n} active={s.layoutType === n} onClick={() => s.setLayout(n)}>
              {n}장
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs text-stone-500">간격</span>
          {([0, 2, 5] as GutterMm[]).map((g) => (
            <Chip key={g} active={s.gutterMm === g} onClick={() => s.setGutter(g)}>
              {g}mm
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="인쇄 여백 (Bleed)">
        <div className="flex gap-1.5">
          {([3, 5] as BleedMm[]).map((b) => (
            <Chip key={b} active={s.bleedMm === b} onClick={() => s.setBleed(b)}>
              {b}mm
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-stone-400">
          회색: 재단 시 잘리는 영역 · 점선: 안전 영역(얼굴은 이 안에)
        </p>
      </Section>

      <Section title="선택한 사진">
        {s.selectedId ? (
          <PhotoTools />
        ) : (
          <p className="text-xs text-stone-400">캔버스에서 사진을 선택하세요.</p>
        )}
      </Section>

      <Section title="다운로드">
        {!exportable && (
          <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
            이 규격의 300dpi 출력은 이 기기에서 지원되지 않습니다. 데스크탑에서 다운로드해주세요.
          </p>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={() => onExport('pdf')}
            disabled={!exportable}
            className="flex-1 rounded-md bg-ink py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            300dpi PDF
          </button>
          <button onClick={() => onExport('png')} className="rounded-md border border-stone-300 px-3 py-2 text-sm">
            PNG
          </button>
          <button onClick={() => onExport('jpg')} className="rounded-md border border-stone-300 px-3 py-2 text-sm">
            JPG
          </button>
        </div>
        <p className="mt-1.5 text-xs text-stone-400">출력 파일은 sRGB 기반 인쇄 파일입니다.</p>
      </Section>
    </div>
  );
}

function PhotoTools() {
  const { selectedId, photos, updatePhoto, removePhoto, zoomPhotoInCell } = useEditorStore();
  const photo = photos.find((p) => p.id === selectedId);
  if (!photo) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-sm">
      <button className="rounded border border-stone-300 px-2 py-1" onClick={() => zoomPhotoInCell(photo.id, 1.1)}>
        확대 +
      </button>
      <button className="rounded border border-stone-300 px-2 py-1" onClick={() => zoomPhotoInCell(photo.id, 1 / 1.1)}>
        축소 −
      </button>
      <button
        className="rounded border border-stone-300 px-2 py-1"
        onClick={() => updatePhoto(photo.id, { rotation: (photo.rotation + 90) % 360 })}
      >
        회전 90°
      </button>
      <button
        className="rounded border border-stone-300 px-2 py-1"
        onClick={() => updatePhoto(photo.id, { scaleX: photo.scaleX === 1 ? -1 : 1 })}
      >
        좌우 반전
      </button>
      <button
        className="rounded border border-stone-300 px-2 py-1"
        onClick={() => updatePhoto(photo.id, { scaleY: photo.scaleY === 1 ? -1 : 1 })}
      >
        상하 반전
      </button>
      <button className="rounded border border-red-200 px-2 py-1 text-red-600" onClick={() => removePhoto(photo.id)}>
        삭제
      </button>
    </div>
  );
}
