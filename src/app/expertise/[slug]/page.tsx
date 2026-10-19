import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceGlyph } from "@/components/shared/EvidenceGlyph";
import { EXPERTISE } from "@/data/expertise";
import { KIND_NAMES, longDate } from "@/data/library";
import { relatedWork } from "@/data/related";
import { LINKS } from "@/data/site";
import styles from "@/components/expertise/Expertise.module.css";

const STAGES = ["Understand", "Design", "Deliver", "Evaluate"];

export function generateStaticParams() {
  return EXPERTISE.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = EXPERTISE.find((x) => x.slug === slug);
  return { title: e?.name ?? "Expertise", description: e?.short };
}

export default async function ExpertiseDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = EXPERTISE.find((x) => x.slug === slug);
  if (!e) notFound();
  const related = relatedWork(e);
  const others = EXPERTISE.filter((x) => x.slug !== e.slug);

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <p className={styles.crumb}>
            <Link href="/expertise/" className="qlink">
              Expertise
            </Link>
          </p>
          <h1 className="h1">
            {e.name}
          </h1>
          <p className={`lede ${styles.heroLede}`}>{e.short}</p>
          <p className={styles.stagesLine}>
            In the policy cycle:{" "}
            {STAGES.map((s, i) => (
              <span key={s} className={styles.stagePill} data-on={e.stages.includes(i)}>
                {s}
              </span>
            ))}
          </p>
        </div>
      </section>

      <section className="section">
        <div className={`container ${styles.detail}`}>
          <div className={styles.detailMain}>
            {e.summary?.length ? (
              <div className="prose">
                {e.summary.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : null}
            {e.services?.length ? (
              <>
                <h2 className={`h4 ${styles.subhead}`}>What this covers</h2>
                <ul role="list" className={styles.services}>
                  {e.services.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {e.facts?.length ? (
              <>
                <h2 className={`h4 ${styles.subhead}`}>In numbers</h2>
                <ul role="list" className={styles.facts}>
                  {e.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className={styles.source}>
              Summarised from{" "}
              <a className="link" href={e.url} target="_blank" rel="noreferrer">
                Verian&rsquo;s {e.name} page
              </a>
              .
            </p>
          </div>
          <aside className={styles.detailSide}>
            <h2 className="h4">Related work</h2>
            {related.length ? (
              <ul role="list" className={styles.related}>
                {related.map((it) => (
                  <li key={it.id}>
                    <a href={it.url} target="_blank" rel="noreferrer">
                      <EvidenceGlyph item={it} size={44} />
                      <span>
                        <span className={styles.relatedTitle}>{it.title}</span>
                        <span className={styles.relatedMeta}>
                          {KIND_NAMES[it.kind]}, {longDate(it.date)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.source}>
                Browse the{" "}
                <Link className="link" href="/insights/">
                  full library
                </Link>
                .
              </p>
            )}
            <a className="btn" href={LINKS.contact} target="_blank" rel="noreferrer">
              Talk to the team
            </a>
          </aside>
        </div>
      </section>

      <section className={`section ${styles.othersBand}`}>
        <div className="container">
          <h2 className="h3">Other areas</h2>
          <ul role="list" className={styles.others}>
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/expertise/${o.slug}/`} className="qlink">
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
