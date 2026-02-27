import { GraduationCap, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/footer";

export const metadata = {
  title: "Datenschutzerklärung - Proposal Checker",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/60"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
              <GraduationCap className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Datenschutzerklärung</h1>
              <p className="text-xs text-white/40">Proposal Checker</p>
            </div>
          </div>
        </header>

        <main className="prose prose-invert prose-sm max-w-none rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white/90 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white/80 [&_p]:text-white/60 [&_li]:text-white/60 [&_strong]:text-white/70 [&_table]:text-white/60 [&_th]:text-white/70 [&_td]:border-white/10 [&_th]:border-white/10 [&_a]:text-blue-400 [&_a:hover]:text-blue-300">
          <h2>1. Verantwortlicher</h2>
          <p>
            Verantwortlich für die Datenverarbeitung auf dieser Webanwendung
            (proposal.aet.cit.tum.de) ist:
          </p>
          <p>
            Technische Universität München<br />
            Lehrstuhl für Applied Education Technologies (AET)<br />
            TUM School of Computation, Information and Technology<br />
            Department of Computer Science<br />
            Boltzmannstraße 3<br />
            85748 Garching bei München<br />
            E-Mail: krusche(at)tum.de
          </p>
          <p>
            Ansprechperson: Prof. Dr. Stephan Krusche
          </p>
          <p>
            Die Technische Universität München ist eine Körperschaft des
            öffentlichen Rechts. Sie wird gesetzlich vertreten durch den
            Präsidenten.
          </p>

          <h2>2. Datenschutzbeauftragter</h2>
          <p>
            Die/der Datenschutzbeauftragte der Technischen Universität München
            ist erreichbar unter:
          </p>
          <p>
            Technische Universität München<br />
            Behördlicher Datenschutzbeauftragter<br />
            Arcisstraße 21<br />
            80333 München<br />
            Telefon: +49-(0)89-289-17052<br />
            E-Mail: beauftragter(at)datenschutz.tum.de
          </p>
          <p>
            Weitere Informationen:{" "}
            <a href="https://www.tum.de/datenschutz" target="_blank" rel="noopener noreferrer">
              www.tum.de/datenschutz
            </a>
          </p>

          <h2>3. Zweck der Anwendung</h2>
          <p>
            Diese Webanwendung dient der KI-gestützten Überprüfung von
            Thesis-Proposals im Rahmen der Forschung und Lehre der
            Forschungsgruppe AET. Studierende und wissenschaftliche
            Mitarbeitende können PDF-Dokumente (Thesis-Proposals) hochladen, die
            automatisiert durch KI-Modelle analysiert werden. Die Ergebnisse
            werden als strukturiertes Feedback zurückgegeben.
          </p>

          <h2>4. Erhobene Daten und Verarbeitungszwecke</h2>

          <h3>4.1 Authentifizierungsdaten</h3>
          <p>
            Bei der Anmeldung über den zentralen Identitätsanbieter der TUM
            (Keycloak OIDC) werden folgende Daten erhoben:
          </p>
          <ul>
            <li>Vor- und Nachname</li>
            <li>E-Mail-Adresse</li>
            <li>
              Rollenzugehörigkeit (z.&nbsp;B. Studierende, Promovierende,
              Administrierende)
            </li>
          </ul>
          <p>
            <strong>Zweck:</strong> Zugangssteuerung, Zuordnung von Reviews zu
            Nutzenden, rollenbasierte Berechtigungen.
          </p>

          <h3>4.2 Hochgeladene Dokumente</h3>
          <p>
            Nutzerinnen und Nutzer laden PDF-Dokumente (Thesis-Proposals) hoch,
            die auf persistentem Speicher des Lehrstuhl-Servers gespeichert
            werden.
          </p>
          <p>
            <strong>Zweck:</strong> Inhaltliche Analyse durch KI-Modelle zur
            Generierung von Feedback.
          </p>
          <p>
            <strong>Hinweis:</strong> Die hochgeladenen Proposals können
            personenbezogene Daten enthalten (z.&nbsp;B. Autorennamen). Nutzerinnen
            und Nutzer werden gebeten, nur die für die Überprüfung notwendigen
            Inhalte im Dokument zu belassen.
          </p>

          <h3>4.3 Review-Daten</h3>
          <p>Zu jedem durchgeführten Review werden gespeichert:</p>
          <ul>
            <li>
              Zuordnung zur einreichenden Person (Nutzername/E-Mail)
            </li>
            <li>Zeitpunkt der Einreichung</li>
            <li>Ergebnisse der KI-Analyse (Feedback-Items, Bewertungen)</li>
          </ul>
          <p>
            <strong>Zweck:</strong> Nachvollziehbarkeit und erneuter Abruf
            vergangener Reviews.
          </p>

          <h3>4.4 Sitzungsdaten</h3>
          <p>
            Während der aktiven Nutzung werden temporäre Sitzungsdaten im
            Arbeitsspeicher des Servers gehalten. Diese umfassen den Fortschritt
            der laufenden Analyse und werden automatisch nach spätestens einer
            Stunde gelöscht.
          </p>

          <h3>4.5 E-Mail-Benachrichtigungen</h3>
          <p>
            Sofern aktiviert, wird die E-Mail-Adresse der nutzenden Person
            verwendet, um eine Benachrichtigung über den Abschluss eines Reviews
            zu versenden.
          </p>

          <h2>5. Rechtsgrundlage der Verarbeitung</h2>
          <ul>
            <li>
              <strong>Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e DSGVO i.&nbsp;V.&nbsp;m.
              Art.&nbsp;4 BayDSG:</strong>{" "}
              Die Verarbeitung ist für die Wahrnehmung einer Aufgabe
              erforderlich, die im öffentlichen Interesse liegt (Forschung und
              Lehre an einer staatlichen Universität).
            </li>
            <li>
              <strong>Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;a DSGVO:</strong> Soweit
              Nutzerinnen und Nutzer freiwillig Dokumente hochladen und die
              KI-gestützte Analyse initiieren, liegt eine Einwilligung durch
              aktive Nutzung vor. Die Nutzung der Anwendung ist freiwillig.
            </li>
          </ul>

          <h2>6. Empfänger und Auftragsverarbeitung</h2>

          <h3>6.1 Azure OpenAI (Microsoft)</h3>
          <p>
            Wird als KI-Anbieter &bdquo;Azure OpenAI&ldquo; gewählt, werden die
            Textinhalte der hochgeladenen Proposals sowie gerenderte
            Seitenbilder an Microsoft Azure OpenAI Service übermittelt. Die
            Verarbeitung erfolgt im Rahmen des bestehenden
            Auftragsverarbeitungsvertrags (AVV) zwischen der TUM und Microsoft
            gemäß Art.&nbsp;28 DSGVO. Die Datenverarbeitung erfolgt in
            Rechenzentren innerhalb der Europäischen Union. Microsoft
            verpflichtet sich vertraglich, die übermittelten Daten nicht für
            eigene Zwecke (z.&nbsp;B. Modelltraining) zu verwenden.
          </p>

          <h3>6.2 Ollama (On-Premises)</h3>
          <p>
            Wird als KI-Anbieter &bdquo;Ollama&ldquo; gewählt, erfolgt die
            gesamte Verarbeitung auf GPU-Infrastruktur der TUM. Es findet keine
            Übermittlung an Dritte statt.
          </p>

          <h3>6.3 Sonstige Empfänger</h3>
          <p>
            Darüber hinaus werden keine personenbezogenen Daten an Dritte
            weitergegeben. Die gesamte Infrastruktur (Webserver, Datenbank,
            Dateispeicher, Identitätsanbieter) wird auf Servern der TUM
            betrieben.
          </p>

          <h2>7. Speicherdauer und Löschung</h2>
          <table>
            <thead>
              <tr>
                <th>Datenart</th>
                <th>Speicherdauer</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Authentifizierungsdaten (JWT-Session)</td>
                <td>
                  Dauer der Browsersitzung; Cookies werden beim Abmelden oder
                  nach Ablauf der Sitzung gelöscht
                </td>
              </tr>
              <tr>
                <td>Sitzungsdaten (In-Memory)</td>
                <td>Maximal 1 Stunde nach letzter Aktivität</td>
              </tr>
              <tr>
                <td>Hochgeladene PDF-Dokumente</td>
                <td>
                  Bis zur manuellen Löschung durch die nutzende Person oder
                  die Administration
                </td>
              </tr>
              <tr>
                <td>Review-Ergebnisse (Datenbank)</td>
                <td>
                  Bis zur manuellen Löschung durch die nutzende Person oder
                  die Administration
                </td>
              </tr>
            </tbody>
          </table>

          <h2>8. Cookies und lokale Speicherung</h2>
          <p>
            Diese Anwendung verwendet ausschließlich <strong>technisch
            notwendige Cookies</strong>:
          </p>
          <ul>
            <li>
              <strong>Sitzungscookie (Session-Token):</strong> Enthält ein
              JWT-Token zur Authentifizierung. Wird für die Dauer der
              Browsersitzung gespeichert und ist für die Funktion der Anwendung
              zwingend erforderlich.
            </li>
            <li>
              <strong>Anbieterpräferenz (localStorage):</strong> Die gewählte
              KI-Anbieter-Einstellung wird im lokalen Speicher des Browsers
              gesichert, um die Auswahl bei erneutem Besuch beizubehalten.
            </li>
          </ul>
          <p>
            Es werden <strong>keine</strong> Analyse-, Tracking- oder
            Werbe-Cookies verwendet. Es werden <strong>keine</strong>{" "}
            Drittanbieter-Skripte eingebunden.
          </p>

          <h2>9. Ihre Rechte</h2>
          <p>
            Als betroffene Person stehen Ihnen gemäß der DSGVO folgende Rechte
            zu:
          </p>
          <ul>
            <li>
              <strong>Auskunftsrecht (Art.&nbsp;15 DSGVO)</strong>
            </li>
            <li>
              <strong>Recht auf Berichtigung (Art.&nbsp;16 DSGVO)</strong>
            </li>
            <li>
              <strong>Recht auf Löschung (Art.&nbsp;17 DSGVO)</strong>
            </li>
            <li>
              <strong>Recht auf Einschränkung der Verarbeitung
              (Art.&nbsp;18 DSGVO)</strong>
            </li>
            <li>
              <strong>Recht auf Datenübertragbarkeit
              (Art.&nbsp;20 DSGVO)</strong>
            </li>
            <li>
              <strong>Widerspruchsrecht (Art.&nbsp;21 DSGVO)</strong>
            </li>
            <li>
              <strong>Recht auf Widerruf der Einwilligung
              (Art.&nbsp;7 Abs.&nbsp;3 DSGVO)</strong>
            </li>
          </ul>
          <p>
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an den oben
            genannten Verantwortlichen oder an den Datenschutzbeauftragten der
            TUM.
          </p>

          <h2>10. Beschwerderecht bei einer Aufsichtsbehörde</h2>
          <p>
            Sie haben gemäß Art.&nbsp;77 DSGVO das Recht, sich bei einer
            Datenschutz-Aufsichtsbehörde zu beschweren. Die zuständige
            Aufsichtsbehörde ist:
          </p>
          <p>
            Bayerischer Landesbeauftragter für den Datenschutz (BayLfD)<br />
            Postanschrift: Postfach 22 12 19, 80502 München<br />
            Adresse: Wagmüllerstraße 18, 80538 München<br />
            Telefon: +49-(0)89-212672-0<br />
            E-Mail: poststelle(at)datenschutz-bayern.de<br />
            <a href="https://www.datenschutz-bayern.de" target="_blank" rel="noopener noreferrer">
              www.datenschutz-bayern.de
            </a>
          </p>

          <h2>11. Datensicherheit</h2>
          <p>
            Die Kommunikation mit dieser Anwendung erfolgt ausschließlich über
            verschlüsselte Verbindungen (HTTPS/TLS). Die Infrastruktur wird
            innerhalb des TUM-Netzwerks auf einem Kubernetes-Cluster betrieben.
            Der Zugang zur Datenbank und zu den gespeicherten Dokumenten ist auf
            die Anwendung beschränkt und nicht öffentlich zugänglich.
          </p>

          <h2>12. Änderungen dieser Datenschutzerklärung</h2>
          <p>
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie
            an geänderte Rechtslagen oder bei Änderungen der Anwendung oder der
            Datenverarbeitung aktuell zu halten. Die jeweils aktuelle Fassung
            ist stets über die Anwendung abrufbar.
          </p>
          <p>
            <em>Stand: Februar 2026</em>
          </p>
        </main>

        <Footer />
      </div>
    </div>
  );
}
