import test from 'node:test';
import assert from 'node:assert/strict';
import { pageGroupSettings, pageGroupPatch, canFitPageGroup, normalizeSourceLocator } from '../js/page-groups.js';

test('legacy choices and disabled arrangement survive round trips', () => {
  for (const key of ['spreadView','pageColumns','stackedView','twoTierView']) {
    const choice = pageGroupSettings({ [key]: true });
    assert.equal(choice.enabled,true);
    assert.equal(choice.arrangement, ['stackedView','twoTierView'].includes(key) ? 'rows' : 'columns');
    assert.deepEqual(pageGroupSettings(pageGroupPatch(true, choice.arrangement)),choice);
  }
  assert.deepEqual(pageGroupSettings(pageGroupPatch(false,'rows')), {enabled:false,arrangement:'rows'});
  assert.deepEqual(pageGroupSettings({spreadView:true,stackedView:true}),{enabled:true,arrangement:'columns'});
});

test('actual face capacity allows landscape phones and portrait stacked views', () => {
  const fits = (width,height,arrangement,writingMode='vertical',fontPx=16) => canFitPageGroup({width,height,arrangement,writingMode,fontPx,lineHeightPx:fontPx*1.8});
  for(const mode of ['vertical','horizontal']) {
    assert.equal(fits(740,260,'columns',mode),true);
    assert.equal(fits(360,900,'rows',mode),true);
    assert.equal(fits(360,650,'columns',mode),false);
    assert.equal(fits(900,260,'rows',mode),false);
    assert.equal(fits(740,260,'columns',mode,38.4),false);
  }
});

test('bookmark source position validates zero and ignores corrupt data', () => {
  assert.deepEqual(normalizeSourceLocator({chapterId:'c2',sourceOffset:0}), {chapterId:'c2',sourceOffset:0});
  for(const value of [null,{}, {sourceOffset:-1},{sourceOffset:'10'},{sourceOffset:Infinity}]) assert.equal(normalizeSourceLocator(value),null);
});
