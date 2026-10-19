import Link from "next/link";
import { EXPERTISE } from "@/data/expertise";
import { AUTHOR, LINKS } from "@/data/site";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.top}>
          <p className={styles.purpose}>Powering decisions that shape the world.</p>
          <div className={styles.actions}>
            <a className="btn" href={LINKS.contact} target="_blank" rel="noreferrer">
              Work with us
            </a>
            <a className="btn btn--ghost" href={LINKS.subscribe} target="_blank" rel="noreferrer">
              Get our latest thinking
            </a>
          </div>
        </div>

        <div className={styles.cols}>
          <nav aria-label="Expertise">
            <h2 className={styles.head}>
              <Link href="/expertise/">Expertise</Link>
            </h2>
            <ul role="list">
              {EXPERTISE.map((e) => (
                <li key={e.slug}>
                  <Link className="qlink" href={`/expertise/${e.slug}/`}>
                    {e.name}
                  </Link>
                </li>
              ))}
              <li>
                <a className="qlink" href={LINKS.centres} target="_blank" rel="noreferrer">
                  Centres of Excellence
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Insights">
            <h2 className={styles.head}>
              <Link href="/insights/">Insights</Link>
            </h2>
            <ul role="list">
              <li>
                <Link className="qlink" href="/insights/?kind=case-study">
                  Case studies
                </Link>
              </li>
              <li>
                <Link className="qlink" href="/insights/">
                  News and insights
                </Link>
              </li>
              <li>
                <Link className="qlink" href="/insights/#map">
                  Evidence map
                </Link>
              </li>
              <li>
                <Link className="qlink" href="/lab/">
                  AI Lab
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="About">
            <h2 className={styles.head}>
              <Link href="/about/">About us</Link>
            </h2>
            <ul role="list">
              <li>
                <Link className="qlink" href="/about/#purpose">
                  Purpose
                </Link>
              </li>
              <li>
                <Link className="qlink" href="/about/#locations">
                  Locations
                </Link>
              </li>
              <li>
                <a className="qlink" href={LINKS.leadership} target="_blank" rel="noreferrer">
                  Global leadership
                </a>
              </li>
              <li>
                <a className="qlink" href={LINKS.institute} target="_blank" rel="noreferrer">
                  Verian Institute for Public Impact
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Careers">
            <h2 className={styles.head}>
              <Link href="/careers/">Careers</Link>
            </h2>
            <ul role="list">
              <li>
                <Link className="qlink" href="/careers/#ai-engineer">
                  Junior AI Engineer
                </Link>
              </li>
              <li>
                <a className="qlink" href={LINKS.careers} target="_blank" rel="noreferrer">
                  All opportunities
                </a>
              </li>
              <li>
                <a className="qlink" href={LINKS.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className={styles.base}>
          <p className={styles.disclaimer}>
            This is an unofficial redesign concept by{" "}
            <Link href="/concept/" className="link">
              {AUTHOR.name}
            </Link>
            , made for a job application. It is not affiliated with or endorsed by Verian. The Verian name and the work
            described here belong to Verian Group; summaries are paraphrased from{" "}
            <a className="link" href={LINKS.original} target="_blank" rel="noreferrer">
              veriangroup.com
            </a>{" "}
            and every item links to its original page.
          </p>
          <ul role="list" className={styles.legal}>
            <li>
              <a href={LINKS.policies} target="_blank" rel="noreferrer">
                Verian policies
              </a>
            </li>
            <li>
              <a href={LINKS.cookies} target="_blank" rel="noreferrer">
                Cookies
              </a>
            </li>
            <li>
              <a href={LINKS.accessibility} target="_blank" rel="noreferrer">
                Accessibility
              </a>
            </li>
            <li>
              <a href={LINKS.press} target="_blank" rel="noreferrer">
                Press enquiries
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
