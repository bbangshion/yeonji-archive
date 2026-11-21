import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { Language } from '../i18n/messages';
import { ArrowIcon } from './Icons';
import { ProfileHistory } from './ProfileHistory';

/** The single source of truth is public/data/yeonji.json (also editable on GitHub mobile). */
type Localized = { ko: string; en: string; ja: string };
type Source = { name: string; level: string; url: string };
type Unit = { id: string; name: string; period: string; debutDate: string; song: string; album: string; members: string[]; description: Localized; sourceIds: string[] };
type Nickname = { id: string; name: string; description: Localized; origin: string; sourceIds: string[] };
type Interest = { id: string; title: Localized; description: Localized; items: string[]; note?: string; sourceIds: string[] };
type MemberData = {
  member: { id: string; name: Localized; dateOfBirth: string; revealedAt: string; musicDebutAt: string;
    bloodType: string; mbti: { value: string; note?: string }; colorName: string; colorHex: string;
    intro: Localized; units: Unit[]; nicknames: Nickname[]; interests: Interest[] },
  sources: Record<string, Source>, lastReviewed: string,
};
const LABEL: Record<Language, Record<string, string>> = {
  ko: { introduction:'소개', units:'유닛', history:'활동 기록', nicknames:'별명', interests:'취향', sources:'출처',
    birthday:'생년월일', revealed:'S 공개', debut:'첫 유닛 데뷔', mbti:'MBTI', blood:'혈액형', color:'대표 색상',
    notes:'멤버 소개', intro:'곽연지의 활동과 공개된 프로필을 정리했습니다', unitsNote:'참여 유닛과 출처', sourceNote:'공식 자료와 팬 자료의 출처를 구분해 표시합니다',
    interestsNote:'취향은 언급 시점에 따라 달라질 수 있습니다', verified:'검토 기준일', info:'데이터를 불러오는 중', failed:'프로필을 불러오지 못했어요', retry:'다시 시도' },
  en: { introduction:'Profile', units:'Dimensions', history:'History', nicknames:'Nicknames', interests:'Interests', sources:'References',
    birthday:'Date of birth', revealed:'Revealed as S12', debut:'First unit debut', mbti:'MBTI', blood:'Blood type', color:'Representative color',
    notes:'Artist profile', intro:'A record of moments on stage and beyond', unitsNote:'Source-linked DIMENSIONs that include YeonJi', sourceNote:'Official references take priority; fan-curated notes are labeled',
    interestsNote:'Personal preferences can change over time', verified:'Last reviewed', info:'Loading profile', failed:'Profile unavailable', retry:'Retry' },
  ja: { introduction:'紹介', units:'ユニット', history:'活動記録', nicknames:'愛称', interests:'趣味', sources:'出典',
    birthday:'生年月日', revealed:'S12公開', debut:'初ユニットデビュー', mbti:'MBTI', blood:'血液型', color:'代表カラー',
    notes:'プロフィール', intro:'ステージと日常のさまざまな瞬間を記録します。', unitsNote:'実際に参加したDIMENSIONを出典とともに掲載します。', sourceNote:'公式情報を優先し、ファン資料は出典を明記します。',
    interestsNote:'好みは時間とともに変わる可能性があります。', verified:'確認日', info:'読み込み中', failed:'プロフィールを読み込めません', retry:'再試行' },
};
const getLocalized = (value: Localized, language: Language) => value[language] || value.ko;
const dateLabel = (value: string) => value.replace(/-/g, '.');
const safeExternal = (link: string): boolean => /^https:\/\//i.test(link);

export function ProfilePage() {
  const { language } = useI18n();
  const l = LABEL[language];
  const [data, setData] = useState<MemberData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(`${import.meta.env.BASE_URL}data/yeonji.json`, { signal: controller.signal, cache: 'no-cache' })
      .then(async response => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<MemberData>; })
      .then(payload => {
        if (controller.signal.aborted) return;
        if (payload.member?.id !== 'S12' || !Array.isArray(payload.member?.units) || !Array.isArray(payload.member?.nicknames)) throw new Error('Invalid S12 profile');
        setData(payload);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  if (!data) return <section className="shion-profile animate-appear pb-12"><header className="shion-page-heading"><span className="shion-page-kicker">S12 / PROFILE</span><h1>{language === 'ko' ? '곽연지' : 'YEONJI'}</h1></header><p role={error ? 'alert' : 'status'} className="text-ash">{error ? l.failed : l.info}</p>{error && <button type="button" className="btn-ghost mt-4" onClick={() => setAttempt(count => count + 1)}>{l.retry}</button>}</section>;
  const { member, sources } = data;
  const factRows = [
    [l.birthday, dateLabel(member.dateOfBirth)], [l.revealed, dateLabel(member.revealedAt)],
    [l.debut, dateLabel(member.musicDebutAt)], [l.blood, member.bloodType],
    [l.mbti, member.mbti.value], [l.color, `${member.colorName} · ${member.colorHex}`],
  ];
  const sourceLinks = (ids: string[]) => ids.map(id => sources[id]).filter((row): row is Source => !!row && safeExternal(row.url));
  return <section className="shion-profile animate-appear pb-12" aria-labelledby="profile-heading">
    <header className="shion-page-heading">
      <span className="shion-page-kicker">S12 / PROFILE</span>
      <h1 id="profile-heading">{getLocalized(member.name, language)}</h1>
      <p>tripleS · Kwak YeonJi</p>
    </header>
    <nav aria-label={l.introduction} className="-mx-1 mb-10 flex gap-2 overflow-x-auto px-1 pb-3 sm:mb-12">
      {([['basic',l.introduction],['units',l.units],['history',l.history],['nicknames',l.nicknames],['interests',l.interests],['references',l.sources]] as const).map(([id,label]) => <a key={id} href={`#profile-${id}`} onClick={event => { event.preventDefault(); document.getElementById(`profile-${id}`)?.scrollIntoView({ behavior:'smooth', block:'start' }); }} className="shrink-0 rounded-sm border border-white/[.12] bg-white/[.025] px-3.5 py-2.5 text-[12px] text-[#cdd6ef] hover:border-[#A6B7FF] hover:text-white">{label}</a>)}
    </nav>
    <div id="profile-basic" className="shion-profile-intro scroll-mt-28">
      <figure className="shion-profile-portrait">
        <img src={`${import.meta.env.BASE_URL}images/yeonji-home.jpg`} alt={getLocalized(member.name,language)} width="1152" height="1536" decoding="async" />
        <figcaption>Kwak YeonJi · S12</figcaption>
      </figure>
      <div className="shion-profile-info">
        <span className="shion-page-kicker">TRIPLES / S12</span>
        <h2>Kwak YeonJi</h2>
        <p className="shion-profile-sub">{getLocalized(member.intro,language)}</p>
        <div className="mb-8 flex flex-wrap gap-2">
          {['S12',...member.units.map(unit => unit.name)].map(label => <span key={label} className="inline-flex min-h-8 items-center border border-white/[.13] bg-white/[.025] px-3 py-1.5 text-[11px]">{label}</span>)}
        </div>
        <dl className="shion-fact-grid">{factRows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <a className="shion-official-link" href="https://www.triples-official.jp/profile/" target="_blank" rel="noopener noreferrer">{l.sources} ↗</a>
      </div>
    </div>
    <section id="profile-units" className="mt-20 scroll-mt-28 sm:mt-28" aria-labelledby="profile-units-heading">
      <span className="shion-page-kicker">DIMENSIONS</span><h2 id="profile-units-heading" className="mt-2 mb-4 text-[clamp(26px,4vw,37px)] font-medium tracking-[-.055em]">{l.units}</h2>
      <p className="mb-6 text-[12px] leading-6 text-ash">{l.unitsNote}</p>
      <div className="divide-y divide-white/[.12] border-y border-white/[.13]">{member.units.map((unit,index) => <details key={unit.id} open={index===0} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-4 py-6 [&::-webkit-details-marker]:hidden"><span className="w-14 text-[12px] tabular-nums text-ash">{unit.period}</span><div className="flex-1"><h3 className="text-[clamp(21px,3vw,27px)] font-medium">{unit.name}</h3><p className="mt-1 text-[11px] text-ash">{unit.album} · {unit.song}</p></div><span className="text-[#A6B7FF] text-[24px] group-open:rotate-45 transition-transform">+</span></summary>
        <div className="pb-8 pl-0 sm:pl-[72px]"><p className="text-[13px] leading-[1.9] text-[#cbd2e4]">{getLocalized(unit.description,language)}</p><p className="mt-4 text-[11px] text-ash">{dateLabel(unit.debutDate)} · {unit.members.length} members</p>
          <div className="mt-3 flex flex-wrap gap-2">{unit.members.map(id => <span key={id} className="border border-white/[.12] px-3 py-1.5 text-[11px] text-ash">{id}</span>)}</div>
          <div className="mt-5 flex flex-wrap gap-4">{sourceLinks(unit.sourceIds).map(row => <a key={row.url} href={row.url} className="text-[11px] text-[#A6B7FF] underline underline-offset-4" target="_blank" rel="noopener noreferrer">{row.name} ↗</a>)}</div>
        </div>
      </details>)}</div>
    </section>
    <ProfileHistory />
    <section id="profile-nicknames" className="mt-20 scroll-mt-28 sm:mt-28" aria-labelledby="profile-nicknames-heading">
      <span className="shion-page-kicker">NICKNAMES</span><h2 id="profile-nicknames-heading" className="mt-2 mb-7 text-[clamp(26px,4vw,37px)] font-medium tracking-[-.055em]">{l.nicknames}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{member.nicknames.map(item => <article key={item.id} className="rounded-sm border border-white/[.1] bg-[#141620] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[17px] font-medium">{item.name}</h3><span className="text-[10px] text-[#A6B7FF]">{item.origin}</span></div>
        <p className="mt-3 text-[12px] leading-6 text-ash">{getLocalized(item.description,language)}</p>
        <div className="mt-5">{sourceLinks(item.sourceIds).map(row => <a key={row.url} href={row.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#A6B7FF]">{row.name} ↗</a>)}</div>
      </article>)}</div>
    </section>
    <section id="profile-interests" className="mt-20 scroll-mt-28 sm:mt-28" aria-labelledby="profile-interests-heading">
      <span className="shion-page-kicker">INTERESTS</span><h2 id="profile-interests-heading" className="mt-2 mb-3 text-[clamp(26px,4vw,37px)] font-medium tracking-[-.055em]">{l.interests}</h2><p className="mb-7 text-[12px] leading-6 text-ash">{l.interestsNote}</p>
      <div className="grid gap-3 md:grid-cols-2">{member.interests.map(group => <article key={group.id} className="rounded-sm border border-white/[.1] bg-white/[.025] p-6">
        <h3 className="text-[17px] font-medium">{getLocalized(group.title,language)}</h3><p className="mt-2 text-[12px] leading-6 text-ash">{getLocalized(group.description,language)}</p>
        <div className="mt-5 flex flex-wrap gap-2">{group.items.map(item => <span className="inline-flex items-center border border-white/[.13] px-3 py-2 text-[11px] text-[#dbe2f6]" key={item}>{item}</span>)}</div>
        {group.note && <p className="mt-4 text-[10px] leading-5 text-ash">{group.note}</p>}
        {sourceLinks(group.sourceIds).map(row => <a key={row.url} href={row.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[10px] text-[#A6B7FF]">{row.name} ↗</a>)}
      </article>)}</div>
    </section>
    <section id="profile-references" className="mt-20 scroll-mt-28 sm:mt-28" aria-labelledby="profile-references-heading">
      <span className="shion-page-kicker">REFERENCES</span><h2 id="profile-references-heading" className="mt-2 mb-6 text-[clamp(26px,4vw,37px)] font-medium tracking-[-.055em]">{l.sources}</h2>
      <p className="mb-4 text-[12px] leading-6 text-ash">{l.sourceNote}</p>
      <div className="divide-y divide-white/[.09] border-y border-white/[.14]">{Object.entries(sources).filter(([,source]) => safeExternal(source.url)).map(([id,source]) => <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 py-5 hover:text-[#A6B7FF]"><span><small className="mb-1 block text-[10px] uppercase tracking-[.08em] text-[#A6B7FF]">{source.level}</small><strong className="text-[13px] font-medium">{source.name}</strong></span><ArrowIcon width={15} height={15}/></a>)}</div>
      <p className="mt-5 text-[11px] leading-[1.9] text-ash">{l.verified} {dateLabel(data.lastReviewed)} · YEONJI ARCHIVE · CREATED BY @bbangshion</p>
    </section>
  </section>;
}
