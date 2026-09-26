// 체험용 샘플 사진: src/sample_picture의 PNG를 빌드 시 정적 자산으로 포함하고,
// 실제 업로드와 같은 processUpload 파이프라인(디코딩 검증·축소본·IndexedDB 원본 저장)을 태워 라이브러리 항목으로 만든다.
// 같은 출처(_next/static) 파일만 읽으므로 외부 통신은 없다.

import type { StaticImageData } from 'next/image';
import type { LibraryItem } from '@/types';
import { processUpload } from './imagePipeline';
import p1 from '@/sample_picture/wedding_photo_1.png';
import p2 from '@/sample_picture/wedding_photo_2.png';
import p3 from '@/sample_picture/wedding_photo_3.png';
import p4 from '@/sample_picture/wedding_photo_4.png';
import p5 from '@/sample_picture/wedding_photo_5.png';
import p6 from '@/sample_picture/wedding_photo_6.png';
import p7 from '@/sample_picture/wedding_photo_7.png';
import p8 from '@/sample_picture/wedding_photo_8.png';
import p9 from '@/sample_picture/wedding_photo_9.png';

const SAMPLES: StaticImageData[] = [p1, p2, p3, p4, p5, p6, p7, p8, p9];

/**
 * 라이브러리 중 샘플에서 온 항목 id. 스토어가 모듈 싱글턴이라 화면을 나갔다 와도 유지되도록 모듈 변수로 둔다.
 * (LibraryItem 타입에 필드를 늘리지 않기 위함)
 */
const sampleIds = new Set<string>();

export const isSampleId = (id: string) => sampleIds.has(id);
export const forgetSampleIds = (ids: string[]) => ids.forEach((id) => sampleIds.delete(id));

/** 샘플을 모두 라이브러리 항목으로 변환한다. 하나라도 실패하면 그 항목만 건너뛴다. */
export async function loadSampleItems(): Promise<LibraryItem[]> {
  const results = await Promise.allSettled(
    SAMPLES.map(async (img, i) => {
      const res = await fetch(img.src, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('sample fetch failed');
      const blob = await res.blob();
      return processUpload(new File([blob], `샘플 ${i + 1}.png`, { type: blob.type || 'image/png' }));
    }),
  );
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  items.forEach((it) => sampleIds.add(it.id));
  return items;
}
