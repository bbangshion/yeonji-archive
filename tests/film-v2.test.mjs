import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseOfficialFeed,mergeReviewQueue,OFFICIAL_CHANNEL_ID} from '../scripts/sync-yeonji-films.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(here);
const xml=`<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>${OFFICIAL_CHANNEL_ID}</yt:channelId><entry><yt:videoId>ZFO2w3TDpb4</yt:videoId><yt:channelId>${OFFICIAL_CHANNEL_ID}</yt:channelId><title>펌프 여신 곽곽 곽연지 | SIGNAL 230518</title><published>2023-05-18T09:00:00+00:00</published></entry><entry><yt:videoId>ABCDEFGHIJK</yt:videoId><yt:channelId>${OFFICIAL_CHANNEL_ID}</yt:channelId><title>다른 멤버 영상</title><published>2026-11-20T09:00:00+00:00</published></entry></feed>`;
test('extracts only title-matched official channel videos',()=>{
 const result=parseOfficialFeed(xml);
 assert.equal(result.length,1);assert.equal(result[0].youtubeId,'ZFO2w3TDpb4');
 assert.equal(result[0].category,'signal');assert.equal(result[0].status,'pending');
});
test('rejects spoofed channel and empty responses',()=>{
 assert.throws(()=>parseOfficialFeed(xml.replaceAll(OFFICIAL_CHANNEL_ID,'UC00000000000000000000')),/Unexpected channel/);
 assert.throws(()=>parseOfficialFeed('<feed></feed>'),/Unexpected channel|Empty Atom/);
});
test('retains prior approvals and excludes already-published IDs',()=>{
 const existing={candidates:[{youtubeId:'11111111111',status:'ignored',publishedAt:'2025-01-01'}]};
 const incoming=parseOfficialFeed(xml);
 const result=mergeReviewQueue(existing,incoming,new Set(['ZFO2w3TDpb4']));
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].status,'ignored');
});
test('scan creates review queue, approval alone changes public catalog, no duplicate',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'yeonji-film-'));
 mkdirSync(path.join(tmp,'public/data'),{recursive:true});
 const catalogFile=path.join(tmp,'public/data/films.json');
 const original={version:2,items:[]};
 writeFileSync(catalogFile,JSON.stringify(original));
 const feedFile=path.join(tmp,'feed.xml');writeFileSync(feedFile,xml);
 const env={...process.env,YEONJI_REPO_ROOT:tmp,YEONJI_FEED_FILE:feedFile};
 const scan=spawnSync(process.execPath,[path.join(root,'scripts/sync-yeonji-films.mjs')],{env,encoding:'utf8'});
 assert.equal(scan.status,0,scan.stderr);
 assert.deepEqual(JSON.parse(readFileSync(catalogFile,'utf8')),original);
 const review=JSON.parse(readFileSync(path.join(tmp,'reports/yeonji-film-review.json'),'utf8'));
 assert.equal(review.candidates.length,1);
 const approval=spawnSync(process.execPath,[path.join(root,'scripts/review-yeonji-films.mjs'),'approve','ZFO2w3TDpb4'],{env,encoding:'utf8'});
 assert.equal(approval.status,0,approval.stderr);
 const final=JSON.parse(readFileSync(catalogFile,'utf8'));
 assert.equal(final.items.length,1);assert.equal(final.items[0].verified,true);
 const repeat=spawnSync(process.execPath,[path.join(root,'scripts/review-yeonji-films.mjs'),'approve','ZFO2w3TDpb4'],{env,encoding:'utf8'});
 assert.notEqual(repeat.status,0);
 const rescanned=spawnSync(process.execPath,[path.join(root,'scripts/sync-yeonji-films.mjs')],{env,encoding:'utf8'});
 assert.equal(rescanned.status,0);
 assert.equal(JSON.parse(readFileSync(path.join(tmp,'reports/yeonji-film-review.json'),'utf8')).candidates.length,1);
});
