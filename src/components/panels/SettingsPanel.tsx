'use client';

// 설정 패널: 용지·레이아웃·여백·bleed·선택 사진 도구·다운로드. 값은 editorStore(메모리)에만 있다. (텍스트 도구는 TEXT_ENABLED로 숨김)

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
 * 텍스트 추가 UI 노출 여부. 현재는 숨김 — 추가 버튼이 없으면 텍스트가 생기지 않으므로 캔버스에도 나타나지 않는다.
 * (스토어·캔버스 렌더링 코드는 그대로 유지 — true로 바꾸면 다시 노출)
 */
const TEXT_ENABLED = false;

/**
 * 용지 크기에 비례한 프리셋: 권장값 × 배율을 반올림하고, 중복·상한 초과는 뺀다.
 * - 여백: A4 권장 30mm × [0, 1/3 … 5/3] → [0,10,20,30,40,50]
 * - 간격: A4 권장 2mm × [0, 1, 2.5, 5] → [0,2,5,10]
 */
function presets(base: number, max: number, ratios: number[]): number[] {
  return [...new Set(ratios.map((r) => Math.round(base * r)))].filter((v) => v <= max);
}
const MARGIN_RATIOS = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3];
const GUTTER_RATIOS = [0, 1, 2.5, 5];

// 사진·텍스트 도구 버튼 공통 스타일 (모바일 터치 타깃 44px)
const TOOL_BTN =
  'min-h-11 rounded-full border border-line px-3 py-1 transition-colors hover:border-accent hover:text-accent lg:min-h-8';
const DANGER_BTN = 'min-h-11 rounded-full border border-danger-line px-3 py-1 text-danger hover:bg-danger-soft lg:min-h-8';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <h3 className="mb-2.5 font-display text-sm text-ink">{title}</h3>
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
      aria-pressed={active}
      // DESIGN.md configurator-option-chip: 흰 pill + 헤어라인. 선택 시 2px Focus Blue 테두리(1px border + 1px ring — 폭이 변해 글자가 밀리지 않게)
      // 색만으로 상태를 구분하지 않도록 선택 시 굵기(600)도 함께 바꾼다. 모바일 터치 타깃 44px
      className={`min-h-11 rounded-full border bg-sheet px-3.5 py-1.5 text-sm transition-colors lg:min-h-8 ${
        active ? 'border-accent-focus font-semibold text-ink ring-1 ring-accent-focus' : 'border-line text-ink-80 hover:border-accent'
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
  // 사진 드래그·텍스트 입력처럼 잦은 변경에 패널 전체가 다시 렌더되지 않도록 쓰는 값만 구독
  const s = useEditorStore(
    useShallow((st) => ({
      paperId: st.paperId,
      widthMm: st.widthMm,
      heightMm: st.heightMm,
      orientation: st.orientation,
      bleedMm: st.bleedMm,
      layoutType: st.layoutType,
      singleShape: st.singleShape,
      gutterMm: st.gutterMm,
      margins: st.margins,
      photoFrame: st.photoFrame,
      selectedId: st.selectedId,
      selectedTextId: st.selectedTextId,
      setPaper: st.setPaper,
      toggleOrientation: st.toggleOrientation,
      setLayout: st.setLayout,
      setSingleShape: st.setSingleShape,
      setGutter: st.setGutter,
      setMargin: st.setMargin,
      setMarginSide: st.setMarginSide,
      setPhotoFrame: st.setPhotoFrame,
      setBleed: st.setBleed,
      addText: st.addText,
    })),
  );
  const hasPhotos = useEditorStore((st) => st.photos.length > 0);
  // 패널이 다시 마운트돼도(모바일 탭 전환) 현재 값이 네 변 동일이 아니면 '변마다 따로'로 연다
  const [marginLinked, setMarginLinked] = useState(() => {
    const m = s.margins;
    return m.top === m.right && m.top === m.bottom && m.top === m.left;
  });

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
            <span className="text-xs text-ink-muted">사진 형태</span>
            <Chip active={s.singleShape === 'rect'} onClick={() => s.setSingleShape('rect')}>
              용지 꽉 채움
            </Chip>
            <Chip active={s.singleShape === 'square'} onClick={() => s.setSingleShape('square')}>
              정사각형
            </Chip>
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">슬롯은 정사각형입니다.</p>
        )}

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-ink-muted">간격</span>
            <span className="text-xs font-semibold text-ink-80">{s.gutterMm}mm</span>
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
            {presets(defaultGutterFor(s.widthMm, s.heightMm), maxGutterFor(s.widthMm, s.heightMm), GUTTER_RATIOS).map((g) => (
              <Chip key={g} active={s.gutterMm === g} onClick={() => s.setGutter(g)}>
                {g}mm
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-muted">여백</span>
            <div className="flex gap-1">
              {/* 동일 모드로 돌아갈 땐 위쪽 값으로 네 변을 맞춰, 화면 표시와 실제 값이 어긋나지 않게 한다 */}
              <Chip
                active={marginLinked}
                onClick={() => {
                  // '변마다 따로'에서 돌아올 때 네 변을 '위' 값 하나로 맞춘다 (슬라이더가 가리킬 값이 하나여야 하므로)
                  if (!marginLinked) s.setMargin(s.margins.top);
                  setMarginLinked(true);
                }}
              >
                네 변 동일
              </Chip>
              <Chip active={!marginLinked} onClick={() => setMarginLinked(false)}>
                변마다 따로
              </Chip>
            </div>
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
                {presets(defaultMarginFor(s.widthMm, s.heightMm), maxMarginFor(s.widthMm, s.heightMm), MARGIN_RATIOS).map((m) => (
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
            <MarginSidesEditor />
          )}
          <p className="mt-1 text-xs text-ink-muted">사진 바깥 흰 여백 — 웨딩 사진은 넉넉하게 권장합니다.</p>
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
          <p className="mt-1 text-xs text-ink-muted">사진마다 테두리 디자인을 입힙니다. 출력 파일에도 반영됩니다.</p>
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
        <p className="mt-1.5 text-xs text-ink-muted">
          회색: 재단 시 잘리는 영역 — 화면 가이드일 뿐이며 출력 파일에는 찍히지 않습니다.
        </p>
      </Section>

      {/* 선택한 사진·필터: 리모컨(PhotoToolbar)에 없는 회전 90°·흑백은 데스크탑에서도 여기서 쓴다 */}
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

      {TEXT_ENABLED && (
        <Section title="텍스트">
          <button
            onClick={() => s.addText()}
            className="min-h-11 w-full rounded-full border border-dashed border-accent/60 bg-accent-soft/40 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft"
          >
            + 텍스트 추가
          </button>
          <p className="mt-1.5 text-xs text-ink-muted">용지 위 아무 곳에나 드래그해 배치할 수 있습니다.</p>
        </Section>
      )}

      {TEXT_ENABLED && s.selectedTextId && (
        <Section title="선택한 텍스트">
          <TextTools />
        </Section>
      )}

      {MOCKUP_PREVIEW_ENABLED && (
        <Section title="미리보기">
          <button
            onClick={onPreview}
            disabled={!hasPhotos || exporting}
            className="min-h-11 w-full rounded-full border border-line py-2 text-sm font-semibold disabled:opacity-40"
          >
            액자 미리보기
          </button>
          <p className="mt-1.5 text-xs text-ink-muted">현재 조판을 액자로 걸어 놓은 모습으로 미리 봅니다.</p>
        </Section>
      )}

      <Section title="다운로드">
        <div className="flex gap-1.5">
          <button
            onClick={() => onExport('pdf')}
            disabled={exporting}
            className="min-h-11 flex-1 rounded-full bg-accent py-2 text-body text-white transition-colors hover:bg-accent-focus disabled:opacity-40"
          >
            {exporting ? '내보내는 중…' : 'PDF'}
          </button>
          <button
            onClick={() => onExport('png')}
            disabled={exporting}
            className="min-h-11 rounded-full border border-accent px-4 py-2 text-body text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
          >
            PNG
          </button>
          <button
            onClick={() => onExport('jpg')}
            disabled={exporting}
            className="min-h-11 rounded-full border border-accent px-4 py-2 text-body text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
          >
            JPG
          </button>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          출력 크기 {s.widthMm}×{s.heightMm}mm · sRGB 기반 인쇄 파일입니다.
        </p>
      </Section>
    </div>
  );
}

function PhotoTools() {
  const photo = useEditorStore((st) => st.photos.find((p) => p.id === st.selectedId));
  const { updatePhoto, removePhoto, zoomPhotoInCell } = useEditorStore(
    useShallow((st) => ({ updatePhoto: st.updatePhoto, removePhoto: st.removePhoto, zoomPhotoInCell: st.zoomPhotoInCell })),
  );
  if (!photo) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-sm">
      <button className={TOOL_BTN} onClick={() => zoomPhotoInCell(photo.id, 1.1)}>
        확대 +
      </button>
      <button className={TOOL_BTN} onClick={() => zoomPhotoInCell(photo.id, 1 / 1.1)}>
        축소 −
      </button>
      <button
        className={TOOL_BTN}
        onClick={() => updatePhoto(photo.id, { rotation: (photo.rotation + 90) % 360 })}
      >
        회전 90°
      </button>
      <button
        className={TOOL_BTN}
        onClick={() => updatePhoto(photo.id, { scaleX: photo.scaleX === 1 ? -1 : 1 })}
      >
        좌우 반전
      </button>
      <button
        className={TOOL_BTN}
        onClick={() => updatePhoto(photo.id, { scaleY: photo.scaleY === 1 ? -1 : 1 })}
      >
        상하 반전
      </button>
      <button className={DANGER_BTN} onClick={() => removePhoto(photo.id)}>
        삭제
      </button>
    </div>
  );
}

function PhotoFilterTools() {
  const photo = useEditorStore((st) => st.photos.find((p) => p.id === st.selectedId));
  const updatePhoto = useEditorStore((st) => st.updatePhoto);
  if (!photo) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-sm">
      <Chip active={photo.grayscale} onClick={() => updatePhoto(photo.id, { grayscale: !photo.grayscale })}>
        흑백
      </Chip>
    </div>
  );
}

function TextTools() {
  const textBox = useEditorStore((st) => st.texts.find((t) => t.id === st.selectedTextId));
  const { updateText, removeText } = useEditorStore(
    useShallow((st) => ({ updateText: st.updateText, removeText: st.removeText })),
  );
  if (!textBox) return null;
  return (
    <div className="space-y-2.5">
      <textarea
        value={textBox.text}
        onChange={(e) => updateText(textBox.id, { text: e.target.value })}
        rows={2}
        className="w-full resize-none rounded-md border border-line bg-sheet p-2 text-sm focus:border-accent"
        placeholder="문구를 입력하세요"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">글자 크기</span>
        <span className="text-xs font-semibold text-ink-80">{textBox.fontSizeMm}mm</span>
      </div>
      <input
        type="range"
        min={3}
        max={30}
        step={1}
        value={textBox.fontSizeMm}
        onChange={(e) => updateText(textBox.id, { fontSizeMm: Number(e.target.value) })}
        className="w-full accent-accent"
        aria-label="글자 크기 mm"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted">정렬</span>
        {(['left', 'center', 'right'] as const).map((align) => (
          <Chip key={align} active={textBox.align === align} onClick={() => updateText(textBox.id, { align })}>
            {align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted">굵게</span>
        <Chip active={textBox.bold} onClick={() => updateText(textBox.id, { bold: !textBox.bold })}>
          B
        </Chip>
        <span className="ml-2 text-xs text-ink-muted">색상</span>
        <input
          type="color"
          value={textBox.color}
          onChange={(e) => updateText(textBox.id, { color: e.target.value })}
          className="h-9 w-11 cursor-pointer rounded-md border border-line p-0.5"
          aria-label="글자 색상"
        />
      </div>

      <button
        className={`${DANGER_BTN} text-sm`}
        onClick={() => removeText(textBox.id)}
      >
        삭제
      </button>
    </div>
  );
}

/**
 * 변마다 여백 조절: 용지 비율 그대로 축소한 미니 도식 둘레에 위·아래·왼쪽·오른쪽 입력칸을 실제 위치대로 배치한다.
 * 슬라이더 4개를 세로로 늘어놓던 방식은 어느 슬라이더가 어느 변인지 한눈에 안 보이고,
 * 마주보는 변 값에 따라 상한이 바뀌어 손잡이가 저절로 움직여 보였다 → 숫자 입력 + 위치 도식으로 교체.
 * 입력칸에 포커스하면 도식의 해당 변이 강조돼 어느 변을 바꾸는지 바로 보인다.
 */
function MarginSidesEditor() {
  const { widthMm, heightMm, margins, setMarginSide } = useEditorStore(
    useShallow((st) => ({
      widthMm: st.widthMm,
      heightMm: st.heightMm,
      margins: st.margins,
      setMarginSide: st.setMarginSide,
    })),
  );
  const [focused, setFocused] = useState<MarginSide | null>(null);

  // 도식 크기(px): 가운데 칸(약 100px)에 용지 비율 그대로 맞춘다
  const k = Math.min(88 / widthMm, 112 / heightMm);
  const input = (side: MarginSide) => (
    <MarginInput
      side={side}
      value={margins[side]}
      max={maxMarginForSide(widthMm, heightMm, side, margins)}
      onCommit={(mm) => setMarginSide(side, mm)}
      onFocusChange={setFocused}
    />
  );
  const band = (side: MarginSide) => (focused === side ? 'bg-accent/35' : 'bg-transparent');

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5">
      <div />
      <div className="justify-self-center">{input('top')}</div>
      <div />

      {input('left')}
      {/* 미니 용지: 바깥 = 용지, 안쪽 = 사진이 들어가는 영역. 크기는 실제 mm 비율 */}
      <div
        aria-hidden
        className="relative justify-self-center border border-line bg-sheet"
        style={{ width: widthMm * k, height: heightMm * k }}
      >
        <div className={`absolute inset-x-0 top-0 transition-colors ${band('top')}`} style={{ height: margins.top * k }} />
        <div className={`absolute inset-x-0 bottom-0 transition-colors ${band('bottom')}`} style={{ height: margins.bottom * k }} />
        <div className={`absolute inset-y-0 left-0 transition-colors ${band('left')}`} style={{ width: margins.left * k }} />
        <div className={`absolute inset-y-0 right-0 transition-colors ${band('right')}`} style={{ width: margins.right * k }} />
        <div
          className="absolute rounded-[1px] bg-desk"
          style={{
            top: margins.top * k,
            left: margins.left * k,
            right: margins.right * k,
            bottom: margins.bottom * k,
          }}
        />
      </div>
      {input('right')}

      <div />
      <div className="justify-self-center">{input('bottom')}</div>
      <div />
    </div>
  );
}

/**
 * 여백 숫자 입력칸(mm). 입력 중엔 문자열 초안을 따로 들고 있어 지우고 다시 쓰는 동안 값이 0으로 튀지 않는다.
 * 검증: 숫자 1~4자리만 반영(허용 목록), 범위 클램프는 스토어(setMarginSide)가 한다.
 * 반영은 Enter·포커스 해제 때 한 번만 — 키마다 반영하면 "21→4→40"처럼 중간값에서 슬롯이 넓어져
 * 사진이 cover 크기로 커진 채 되돌아오지 않는다(keepPhotosOnPaper는 키우기만 한다).
 */
function MarginInput({
  side,
  value,
  max,
  onCommit,
  onFocusChange,
}: {
  side: MarginSide;
  value: number;
  max: number;
  onCommit: (mm: number) => void;
  onFocusChange: (side: MarginSide | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col items-center gap-0.5">
      <span className="text-xs leading-none text-ink-muted">{MARGIN_SIDE_LABELS[side]}</span>
      <span className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onFocus={() => onFocusChange(side)}
          onBlur={() => {
            if (draft !== null && /^\d{1,4}$/.test(draft)) onCommit(Number(draft));
            setDraft(null);
            onFocusChange(null);
          }}
          aria-label={`${MARGIN_SIDE_LABELS[side]} 여백 mm (최대 ${max}mm)`}
          className="h-11 w-[4.5rem] rounded-md border [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none border-line bg-sheet pl-2 pr-7 text-center text-sm tabular-nums text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 lg:h-8"
        />
        <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
          mm
        </span>
      </span>
    </label>
  );
}
