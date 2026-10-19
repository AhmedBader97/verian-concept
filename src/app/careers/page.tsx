import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "@/data/site";
import styles from "@/components/pages/Pages.module.css";

export const metadata: Metadata = {
  title: "Careers",
  description: "Careers at Verian, including the Junior AI Engineer / Forward Deployed Engineer role.",
};

const DO = [
  { title: "AI engineering and agentic systems", body: "LLM applications and agentic workflows for research and analysis: harnesses, context and memory, tool integrations and orchestration, with the right permissions and human oversight." },
  { title: "Scoping and experimentation", body: "Defining problems, testing alternative architectures such as agentic RAG, GraphRAG or simpler designs, and using evidence to balance quality, reliability, cost and research needs." },
  { title: "Implementation and testing", body: "Turning prototypes into reliable tools: pipelines, APIs and interfaces, tested on realistic tasks, with data protection, reproducibility and monitoring built in." },
  { title: "Research and analysis", body: "Applying AI and data science to real research questions with policy researchers, validating against expert judgement and simpler methods, and keeping sources traceable." },
  { title: "Client engagement", body: "Understanding needs, agreeing success criteria, demonstrating solutions, gathering feedback and supporting adoption, sometimes contributing to proposals." },
];

const LOOK = [
  "A degree in computer science, AI, data science, statistics, computational social science, economics or a related field, or equivalent practical experience",
  "Evidence that you like to build: AI applications, ML models or analytical workflows you created, evaluated and improved",
  "Working Python, and confidence with JavaScript or TypeScript, APIs, version control and structured development",
  "Curiosity about AI research and tools, with the judgement to decide what to adopt, improve or stop",
  "A research mindset and an interest in public policy and how governments decide",
  "Clear written English and ownership of well-scoped work",
];

const PERKS = [
  "No fixed office hours, with remote working options",
  "Office-based staff can work remotely for up to half their time",
  "Private health insurance for office-based employees",
  "Extra days off",
  "Access to the Mindletic emotional intelligence training app",
  "Dedicated time for experimentation, with training, coaching and feedback",
];

export default function CareersPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <h1 className="h1">
            Work on the questions that shape public policy
          </h1>
          <p className={`lede ${styles.heroLede}`}>
            Verian&rsquo;s people work on projects that inform the design of public policy, drive social change and help
            shape the future of society. Seasoned experts and recent graduates alike find room to grow here.
          </p>
          <div className={styles.heroActions}>
            <a className="btn" href={LINKS.careers} target="_blank" rel="noreferrer">
              See all opportunities
            </a>
            <Link className="btn btn--ghost" href="#ai-engineer">
              The AI engineering role
            </Link>
          </div>
        </div>
      </section>

      <section className={`section ${styles.roleBand}`} id="ai-engineer" aria-labelledby="role-title">
        <div className="container">
          <div className={styles.roleHead}>
            <p className={styles.roleKicker}>Featured role</p>
            <h2 id="role-title" className="h2">
              Junior AI Engineer / Forward Deployed Engineer
            </h2>
            <p className="lede">
              Build and deploy AI alongside researchers, project teams and clients: hands-on work where AI engineering,
              applied research and real-world problem solving meet.
            </p>
          </div>

          <div className={styles.roleGrid}>
            <div>
              <h3 className="h4">What you would do</h3>
              <ul role="list" className={styles.doList}>
                {DO.map((d) => (
                  <li key={d.title}>
                    <span className={styles.doTitle}>{d.title}</span>
                    <span className={styles.doBody}>{d.body}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.roleSide}>
              <h3 className="h4">What they look for</h3>
              <ul role="list" className={styles.lookList}>
                {LOOK.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <h3 className="h4">Pay and benefits</h3>
              <p className={styles.pay}>GBP 1,600 to 2,500 gross per month, depending on qualifications and experience.</p>
              <ul role="list" className={styles.lookList}>
                {PERKS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>

          <aside className={styles.callout}>
            <div>
              <p className={styles.calloutKicker}>A note from the person who rebuilt this site</p>
              <p className={styles.calloutText}>
                I made this redesign as my application for this role. The AI Lab is a working answer to the brief: an agent
                harness with permissions, memory and human approval; five retrieval designs compared on the same questions;
                failure tests; and a Python reference implementation checked against the browser version.
              </p>
            </div>
            <div className={styles.calloutActions}>
              <Link className="btn" href="/concept/">
                How it maps to the role
              </Link>
              <Link className="btn btn--ghost" href="/lab/">
                Open the AI Lab
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="section" aria-labelledby="life-title">
        <div className={`container ${styles.split}`}>
          <h2 id="life-title" className="h3">
            Life at Verian
          </h2>
          <div className="prose">
            <p>
              Verian aims for a dynamic, inclusive environment where everyone can contribute their own talents. Work is
              varied, spanning many clients and countries, and in the AI team ownership grows as your skills do.
            </p>
            <p>
              Hear from colleagues around the world on{" "}
              <a className="link" href="https://www.veriangroup.com/careers" target="_blank" rel="noreferrer">
                Verian&rsquo;s careers page
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
