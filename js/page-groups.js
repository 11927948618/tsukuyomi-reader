// Preserve the four legacy keys used by books, profiles and exported ZIPs.
export function pageGroupSettings(settings = {}) {
  const columns = settings.spreadView === true || settings.pageColumns === true;
  const rows = !columns && (settings.stackedView === true || settings.twoTierView === true);
  return { enabled: columns || rows, arrangement: columns ? 'columns' : rows ? 'rows'
    : settings.spreadArrangement === 'rows' ? 'rows' : 'columns' };
}

export function pageGroupPatch(enabled, arrangement = 'columns') {
  const rows = arrangement === 'rows';
  return { spreadArrangement: rows ? 'rows' : 'columns', spreadView: enabled && !rows,
    pageColumns: enabled && !rows, stackedView: enabled && rows, twoTierView: enabled && rows };
}

export function canFitPageGroup({ width, height, arrangement, writingMode, fontPx, lineHeightPx, gap = 28 }) {
  const pageWidth = arrangement === 'rows' ? width : (width - gap) / 2;
  const pageHeight = arrangement === 'rows' ? (height - gap) / 2 : height;
  const axis = arrangement === 'rows' ? height : width;
  const inline = writingMode === 'horizontal' ? pageWidth : pageHeight;
  const block = writingMode === 'horizontal' ? pageHeight : pageWidth;
  // At least eight characters and four lines per face. Use actual usable space,
  // not device type or pointer capabilities; retain the choice on fallback.
  return axis >= 480 && inline >= Math.max(120, fontPx * 8)
    && block >= Math.max(100, lineHeightPx * 4);
}

export function normalizeSourceLocator(value) {
  if (!value || !Number.isFinite(value.sourceOffset) || value.sourceOffset < 0) return null;
  return { chapterId: String(value.chapterId || 'chapter-001'), sourceOffset: value.sourceOffset };
}
