import Link from "next/link";
import styles from "./HomeSections.module.css";

export function CareersTeaser() {
  return (
    <section className={`section ${styles.opaque}`} aria-labelledby="join-title">
      <div className="container">
        <div className={styles.join}>
          <div>
            <h2 id="join-title" className="h2">
              Join us
            </h2>
            <p className="lede">
              Work on projects that inform public policy, drive social change and help shape the future of society, whether
              you are a seasoned expert or a recent graduate.
            </p>
          </div>
          <div className={styles.joinRole}>
            <p className={styles.joinKicker}>Now hiring</p>
            <p className={styles.joinTitle}>Junior AI Engineer / Forward Deployed Engineer</p>
            <p className={styles.joinText}>Build and deploy AI alongside researchers, project teams and clients.</p>
            <div className={styles.joinActions}>
              <Link className="btn" href="/careers/#ai-engineer">
                Read the role
              </Link>
              <Link className="btn btn--ghost" href="/careers/">
                Life at Verian
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
