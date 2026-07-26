'use client';

import { useState } from 'react';
import { PAPER_SIZES } from '@/lib/paperSizes';
import {
  defaultGutterFor,
  defaultMarginFor,
  maxGutterFor,
  maxMarginFor,
  maxMarginForSide,
  useEditorStore,
  type MarginSide,
} from '@/stores/editorStore';
import { LAYOUT_COUNTS } from '@/lib/layoutCalc';
import type { BleedMm } from '@/types';

const MARGIN_SIDE_LABELS: Record<MarginSide, string> = {
  top: '위',
  right: '오른쪽',
  bottom: '아래',
  left: '왼쪽',
};

/**
 * 목업(액자) 미리보기 노출 여부. 현재는 숨김 — true로 바꾸면 미리보기 버튼이 다시 나온다.
 * (기능·모달 코드는 그대로 유지)
 */
const MOCKUP_PREVIEW_ENABLED = false;

/**
 * 사진 테두리(폴라로이드·인생네컷) 선택 UI 노출 여부. 현재는 숨김.
 * (렌더링·스토어 코드는 그대로 유지 — true로 바꾸면 다시 노출)
 */
const PHOTO_FRAME_ENABLED = false;

/**
 * 여백 프리셋은 용지 크기에 비례해 생성한다.
 * 권장값(A4 기준 30mm)을 중심으로 0 ~ 권장×5/3 구간 — A4에서는 [0,10,20,30,40,50].
 */
function marginPresets(widthMm: number, heightMm: number): number[] {
  const base = defaultMarginFor(widthMm, heightMm);
  const max = maxMarginFor(widthMm, heightMm);
  const steps = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3].map((r) => Math.round(base * r));
  return [...new Set(steps)].filter((m) => m <= max);
}

/**
 * 간격 프리셋도 용지 크기에 비례해 생성한다.
 * 권장값(A4 기준 2mm) 기준 — A4에서는 [0, 2, 5, 10].
 */
function gutterPresets(widthMm: number, heightMm: number): number[] {
  const base = defaultGutterFor(widthMm, heightMm);
  const max = maxGutterFor(widthMm, heightMm);
  const steps = [0, 1, 2.5, 5].map((r) => Math.round(base * r));
  return [...new Set(steps)].filter((g) => g <= max);
}

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

export default function SettingsPanel({
  onExport,
  onPreview,
  exporting = false,
}: {
  onExport: (format: 'png' | 'jpg' | 'pdf') => void;
  onPreview: () => void;
  exporting?: boolean;
}) {
  const s = useEditorStore();
  const [marginLinked, setMarginLinked] = useState(true);

  const hasPhotos = s.photos.length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section title="용지">
        <div className="flex flex-wrap gap-1.5">
          {PAPER_SIZES.map((p) => (
            <Chip key={p.id} active={s.paperId === p.id} onClick={() => s.setPaper(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
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
        <div className="flex flex-wrap gap-1.5">
          {LAYOUT_COUNTS.map((n) => (
            <Chip key={n} active={s.layoutType === n} onClick={() => s.setLayout(n)}>
              {n}장
            </Chip>
          ))}
        </div>

        {s.layoutType === 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-500">사진 형태</span>
            <Chip active={s.singleShape === 'rect'} onClick={() => s.setSingleShape('rect')}>
              용지 꽉 채움
            </Chip>
            <Chip active={s.singleShape === 'square'} onClick={() => s.setSingleShape('square')}>
              정사각형
            </Chip>
          </div>
        ) : (
          <p className="mt-1 text-xs text-stone-400">슬롯은 정사각형입니다.</p>
        )}

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-stone-500">간격</span>
            <span className="text-xs font-medium text-stone-700">{s.gutterMm}mm</span>
          </div>
          <input
            type="range"
            min={0}
            max={maxGutterFor(s.widthMm, s.heightMm)}
            step={1}
            value={s.gutterMm}
            onChange={(e) => s.setGutter(Number(e.target.value))}
            className="w-full accent-accent"
            aria-label="슬롯 간격 mm"
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {gutterPresets(s.widthMm, s.heightMm).map((g) => (
              <Chip key={g} active={s.gutterMm === g} onClick={() => s.setGutter(g)}>
                {g}mm
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-stone-500">상하좌우 여백</span>
            <button
              onClick={() => setMarginLinked((v) => !v)}
              className="text-xs text-accent underline-offset-2 hover:underline"
            >
              {marginLinked ? '변마다 따로 조절' : '네 변 동일하게'}
            </button>
          </div>

          {marginLinked ? (
            <>
              <input
                type="range"
                min={0}
                max={maxMarginFor(s.widthMm, s.heightMm)}
                step={1}
                value={s.margins.top}
                onChange={(e) => s.setMargin(Number(e.target.value))}
                className="w-full accent-accent"
                aria-label="상하좌우 여백 mm"
              />
              <div className="mt-1 flex flex-wrap gap-1.5">
                {marginPresets(s.widthMm, s.heightMm).map((m) => (
                    <Chip
                      key={m}
                      active={s.margins.top === m && s.margins.right === m && s.margins.bottom === m && s.margins.left === m}
                      onClick={() => s.setMargin(m)}
                    >
                      {m}mm
                    </Chip>
                  ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {(['top', 'right', 'bottom', 'left'] as MarginSide[]).map((side) => (
                <div key={side}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-xs text-stone-500">{MARGIN_SIDE_LABELS[side]}</span>
                    <span className="text-xs font-medium text-stone-700">{s.margins[side]}mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxMarginForSide(s.widthMm, s.heightMm, side, s.margins)}
                    step={1}
                    value={s.margins[side]}
                    onChange={(e) => s.setMarginSide(side, Number(e.target.value))}
                    className="w-full accent-accent"
                    aria-label={`${MARGIN_SIDE_LABELS[side]} 여백 mm`}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-stone-400">사진 바깥 흰 여백 — 웨딩 사진은 넉넉하게 권장합니다.</p>
        </div>
      </Section>

      {PHOTO_FRAME_ENABLED && (
        <Section title="사진 테두리">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['none', '없음'],
                ['polaroid', '폴라로이드'],
                ['life4cut', '인생네컷'],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} active={s.photoFrame === id} onClick={() => s.setPhotoFrame(id)}>
                {label}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-400">사진마다 테두리 디자인을 입힙니다. 출력 파일에도 반영됩니다.</p>
        </Section>
      )}

      <Section title="인쇄 여백 (Bleed)">
        <div className="flex gap-1.5">
          {([0, 3, 5] as BleedMm[]).map((b) => (
            <Chip key={b} active={s.bleedMm === b} onClick={() => s.setBleed(b)}>
              {b}mm
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-stone-400">
          회색: 재단 시 잘리는 영역 — 화면 가이드일 뿐이며 출력 파일에는 찍히지 않습니다.
        </p>
      </Section>

      {s.selectedId && (
        <Section title="선택한 사진">
          <PhotoTools />
        </Section>
      )}

      {s.selectedId && (
        <Section title="필터">
          <PhotoFilterTools />
        </Section>
      )}

      {MOCKUP_PREVIEW_ENABLED && (
        <Section title="미리보기">
          <button
            onClick={onPreview}
            disabled={!hasPhotos || exporting}
            className="w-full rounded-md border border-stone-300 py-2 text-sm font-medium disabled:opacity-40"
          >
            액자 미리보기
          </button>
          <p className="mt-1.5 text-xs text-stone-400">현재 조판을 액자로 걸어 놓은 모습으로 미리 봅니다.</p>
        </Section>
      )}

      <Section title="다운로드">
        <div className="flex gap-1.5">
          <button
            onClick={() => onExport('pdf')}
            disabled={exporting}
            className="flex-1 rounded-md bg-ink py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {exporting ? '내보내는 중…' : 'PDF'}
          </button>
          <button
            onClick={() => onExport('png')}
            disabled={exporting}
            className="rounded-md border border-stone-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            PNG
          </button>
          <button
            onClick={() => onExport('jpg')}
            disabled={exporting}
            className="rounded-md border border-stone-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            JPG
          </button>
        </div>
        <p className="mt-1.5 text-xs text-stone-400">
          출력 크기 {s.widthMm}×{s.heightMm}mm · sRGB 기반 인쇄 파일입니다.
        </p>
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

function PhotoFilterTools() {
  const { selectedId, photos, updatePhoto } = useEditorStore();
  const photo = photos.find((p) => p.id === selectedId);
  if (!photo) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-sm">
      <Chip active={photo.grayscale} onClick={() => updatePhoto(photo.id, { grayscale: !photo.grayscale })}>
        흑백
      </Chip>
    </div>
  );
}
