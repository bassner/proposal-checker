import { GraduationCap, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { GdprActions } from "@/components/gdpr-actions";
import { auth } from "@/auth";

export const metadata = {
  title: "Datenschutzerklärung - Proposal Checker",
};

export default async function PrivacyPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user?.id;
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
          <p>
            Die{" "}
            <a href="https://www.tum.de/" target="_blank" rel="noopener noreferrer">
              Technische Universität München (TUM)
            </a>{" "}
            nimmt den Schutz personenbezogener Daten sehr ernst. Diese
            Datenschutzerklärung informiert Sie über Art, Umfang und Zweck der
            Verarbeitung personenbezogener Daten im Rahmen der Nutzung der
            Webanwendung &bdquo;Proposal Checker&ldquo; unter{" "}
            <a href="https://proposal.aet.cit.tum.de" target="_blank" rel="noopener noreferrer">
              proposal.aet.cit.tum.de
            </a>.
          </p>

          <h2>1. Name und Kontaktdaten des Verantwortlichen</h2>
          <p>
            Verantwortlich für die Datenverarbeitung ist:
          </p>
          <p>
            Technische Universität München<br />
            Postanschrift: Arcisstraße 21, 80333 München<br />
            Telefon: +49-(0)89-289-01<br />
            E-Mail: poststelle(at)tum.de
          </p>
          <p>
            Die Technische Universität München ist eine Körperschaft des
            öffentlichen Rechts. Sie wird gesetzlich vertreten durch den
            Präsidenten.
          </p>
          <p>
            <strong>Fachlich verantwortliche Stelle:</strong>
          </p>
          <p>
            Lehrstuhl für Applied Education Technologies (AET)<br />
            TUM School of Computation, Information and Technology<br />
            Department of Computer Science<br />
            Boltzmannstraße 3<br />
            85748 Garching bei München<br />
            E-Mail: krusche(at)tum.de<br />
            Ansprechperson: Prof. Dr. Stephan Krusche
          </p>

          <h2>2. Kontaktdaten des Datenschutzbeauftragten</h2>
          <p>
            Der/die Datenschutzbeauftragte der Technischen Universität München
            ist erreichbar unter:
          </p>
          <p>
            Technische Universität München<br />
            Behördlicher Datenschutzbeauftragter<br />
            Postanschrift: Arcisstraße 21, 80333 München<br />
            Telefon: +49-(0)89-289-17052<br />
            E-Mail: beauftragter(at)datenschutz.tum.de
          </p>
          <p>
            Weitere Informationen zum Datenschutz an der TUM:{" "}
            <a href="https://www.tum.de/datenschutz" target="_blank" rel="noopener noreferrer">
              www.tum.de/datenschutz
            </a>
          </p>

          <h2>3. Zweck und Rechtsgrundlagen der Verarbeitung</h2>

          <h3>3.1 Zweck der Anwendung</h3>
          <p>
            Diese Webanwendung dient der KI-gestützten Überprüfung von
            Thesis-Proposals und vollständigen Abschlussarbeiten im Rahmen der
            Forschung und Lehre des Lehrstuhls AET. Studierende und
            wissenschaftliche Mitarbeitende können PDF-Dokumente hochladen, die
            automatisiert durch KI-Modelle analysiert werden. Die Ergebnisse
            werden als strukturiertes Feedback zurückgegeben. Die Nutzung der
            Anwendung ist freiwillig.
          </p>

          <h3>3.2 Rechtsgrundlagen</h3>
          <p>
            Die Rechtsgrundlage für die Verarbeitung ergibt sich, soweit nichts
            anderes angegeben ist, aus:
          </p>
          <ul>
            <li>
              <strong>Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e DSGVO i.&nbsp;V.&nbsp;m.
              Art.&nbsp;4 Abs.&nbsp;1 BayDSG</strong> (Wahrnehmung einer Aufgabe
              im öffentlichen Interesse): Die Verarbeitung ist für die Erfüllung
              der Lehr- und Forschungsaufgaben der Universität erforderlich.
              Darüber hinaus gelten Art.&nbsp;61{" "}
              <a href="https://www.gesetze-bayern.de/Content/Document/BayHSchG" target="_blank" rel="noopener noreferrer">
                Bayerisches Hochschulgesetz (BayHSchG)
              </a>{" "}
              sowie die{" "}
              <a href="https://portal.mytum.de/archiv/kompendium_rechtsangelegenheiten/apso/folder_listing" target="_blank" rel="noopener noreferrer">
                Allgemeine Prüfungs- und Studienordnung (APSO)
              </a>{" "}
              der TUM.
            </li>
            <li>
              <strong>Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;a DSGVO</strong>{" "}
              (Einwilligung): Soweit Nutzerinnen und Nutzer freiwillig Dokumente
              hochladen und die KI-gestützte Analyse initiieren, liegt eine
              Einwilligung durch aktive Nutzung vor. Die Einwilligung kann
              jederzeit mit Wirkung für die Zukunft widerrufen werden; die
              Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt
              davon unberührt.
            </li>
          </ul>

          <h2>4. Erhobene Daten und Verarbeitungszwecke</h2>

          <h3>4.1 Authentifizierungsdaten</h3>
          <p>
            Bei der Anmeldung über den zentralen Identitätsanbieter der TUM
            (Keycloak OIDC Single Sign-On) werden folgende Daten erhoben und
            in der Nutzertabelle der Anwendung gespeichert:
          </p>
          <ul>
            <li>TUM-Kennung (Benutzer-ID)</li>
            <li>Vor- und Nachname</li>
            <li>E-Mail-Adresse</li>
            <li>
              Rollenzugehörigkeit (z.&nbsp;B. Studierende, Promovierende,
              Administrierende) — abgeleitet aus dem Keycloak-Zugriffstoken
            </li>
          </ul>
          <p>
            <strong>Zweck:</strong> Zugangssteuerung, Zuordnung von Reviews zu
            Nutzenden, rollenbasierte Berechtigungen (z.&nbsp;B. Zugang zu
            KI-Anbietern, Einsicht in zugeordnete Reviews).
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e
            DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG. Die
            Authentifizierung ist technisch erforderlich, um den Zugang zur
            Plattform zu verwalten und die Integrität des Lehrbetriebs zu
            gewährleisten.
          </p>
          <p>
            <strong>Speicherdauer:</strong> Nutzerdaten werden für die Dauer der
            aktiven Nutzung der Plattform gespeichert. Bei Exmatrikulation oder
            auf Antrag werden die Daten gelöscht, sofern keine gesetzlichen
            Aufbewahrungsfristen entgegenstehen.
          </p>

          <h3>4.2 Hochgeladene Dokumente</h3>
          <p>
            Nutzerinnen und Nutzer laden PDF-Dokumente (Thesis-Proposals oder
            vollständige Abschlussarbeiten) hoch. Diese werden auf persistentem
            Speicher innerhalb des Kubernetes-Clusters der TUM gespeichert.
          </p>
          <p>
            <strong>Zweck:</strong> Inhaltliche Analyse durch KI-Modelle zur
            Generierung von Feedback. Zudem ermöglicht die Speicherung die
            erneute Analyse (Retry) oder die Einreichung von Folgeversionen.
          </p>
          <p>
            <strong>Hinweis:</strong> Die hochgeladenen Dokumente können
            personenbezogene Daten enthalten (z.&nbsp;B. Autorennamen,
            Matrikelnummern). Nutzerinnen und Nutzer werden gebeten, nur die
            für die Überprüfung notwendigen Inhalte im Dokument zu belassen.
          </p>
          <p>
            <strong>Speicherdauer:</strong> Bis zur Löschung durch die nutzende
            Person (Selbstlöschung in der Anwendung) oder durch die
            Administration.
          </p>

          <h3>4.3 KI-Analyse und Bildverarbeitung</h3>
          <p>
            Im Rahmen der Analyse werden folgende Verarbeitungsschritte
            durchgeführt:
          </p>
          <ul>
            <li>
              <strong>Textextraktion:</strong> Der Textinhalt der PDF-Seiten
              wird maschinell extrahiert.
            </li>
            <li>
              <strong>Seitenrendering:</strong> Die Seiten des PDF-Dokuments
              werden serverseitig als PNG-Bilder gerendert (mittels Poppler/pdftoppm),
              um dem KI-Modell eine visuelle Analyse
              (z.&nbsp;B. Abbildungen, Seitenlayout, Struktur) zu ermöglichen.
            </li>
            <li>
              <strong>KI-Verarbeitung:</strong> Sowohl der extrahierte Text als
              auch die gerenderten Seitenbilder werden an das gewählte
              KI-Modell (Azure OpenAI oder Ollama) übermittelt. Die Analyse
              erfolgt in 7 parallelen Prüfgruppen (z.&nbsp;B. Struktur,
              Problemstellung, Literaturverzeichnis, Abbildungen, Schreibstil,
              KI-Transparenz, Zeitplan), gefolgt von einem Zusammenführungsschritt.
            </li>
          </ul>
          <p>
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;a
            DSGVO (Einwilligung durch aktives Hochladen und Starten der Analyse).
          </p>
          <p>
            Die gerenderten PNG-Bilder werden ausschließlich temporär im
            Arbeitsspeicher bzw. im temporären Dateisystem des Servers erzeugt
            und nach Abschluss der Analyse gelöscht.
          </p>

          <h3>4.4 Review-Daten</h3>
          <p>Zu jedem durchgeführten Review werden in der Datenbank gespeichert:</p>
          <ul>
            <li>
              Zuordnung zur einreichenden Person (Benutzer-ID, E-Mail, Name)
            </li>
            <li>Zeitpunkt der Einreichung und Fertigstellung</li>
            <li>Gewählter KI-Anbieter und Review-Modus (Proposal/Thesis)</li>
            <li>Ergebnisse der KI-Analyse (Feedback-Items, Bewertungen)</li>
            <li>
              Annotationen (z.&nbsp;B. Markierungen einzelner Ergebnisse als
              erledigt, abgelehnt, oder bestätigt)
            </li>
            <li>
              Kommentare und Diskussionsfäden zu einzelnen Ergebnissen
            </li>
            <li>
              Ggf. Zuordnung zu Betreuer/in und Studierender/m
              (Supervisor-Student-Beziehung)
            </li>
            <li>Share-Links (Token, Ablaufdatum, ggf. Passwort-Hash)</li>
            <li>Inhaltshash (SHA-256) zur Duplikaterkennung</li>
          </ul>
          <p>
            <strong>Zweck:</strong> Nachvollziehbarkeit, erneuter Abruf
            vergangener Reviews, Betreuungsunterstützung, Versionsverlauf.
          </p>
          <p>
            <strong>Speicherdauer:</strong> Bis zur Löschung durch die nutzende
            Person oder die Administration.
          </p>

          <h3>4.5 Sitzungsdaten</h3>
          <p>
            Während der aktiven Nutzung werden temporäre Sitzungsdaten im
            Arbeitsspeicher des Servers gehalten. Diese umfassen den Fortschritt
            der laufenden Analyse (Server-Sent Events) und werden automatisch
            nach spätestens einer Stunde gelöscht.
          </p>

          <h3>4.6 Audit-Protokollierung</h3>
          <p>
            Zur Nachvollziehbarkeit und Sicherheit werden bestimmte
            Nutzeraktionen in einem Audit-Log protokolliert. Dabei werden
            folgende Daten erfasst:
          </p>
          <ul>
            <li>Benutzer-ID, E-Mail-Adresse und Name der handelnden Person</li>
            <li>Art der Aktion (z.&nbsp;B. Review erstellt, gelöscht, geteilt,
            Annotation geändert, Kommentar hinzugefügt)</li>
            <li>Zeitpunkt der Aktion</li>
            <li>Zusätzliche kontextbezogene Details (z.&nbsp;B. gewählter Anbieter,
            Dateiname)</li>
          </ul>
          <p>
            <strong>Zweck:</strong> Nachvollziehbarkeit von Änderungen,
            Missbrauchserkennung, Unterstützung bei der Fehleranalyse.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e
            DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG (berechtigtes
            Interesse an der Sicherheit und Integrität des Dienstes).
          </p>
          <p>
            <strong>Speicherdauer:</strong> Audit-Log-Einträge werden für die
            Lebensdauer des zugehörigen Reviews gespeichert und bei dessen
            Löschung automatisch entfernt.
          </p>

          <h3>4.7 Rate-Limiting</h3>
          <p>
            Zum Schutz vor Überlastung werden Benutzer-IDs und Zeitstempel
            von Review-Anfragen im Arbeitsspeicher des Servers in einem
            gleitenden Zeitfenster (standardmäßig 1 Stunde) vorgehalten.
            Es werden keine IP-Adressen zu diesem Zweck erhoben.
          </p>
          <p>
            <strong>Zweck:</strong> Schutz der Infrastruktur vor Überlastung
            und Missbrauch.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e
            DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG.
          </p>
          <p>
            <strong>Speicherdauer:</strong> Die Daten werden automatisch nach
            Ablauf des Zeitfensters (max. 1 Stunde) aus dem Arbeitsspeicher
            entfernt.
          </p>

          <h3>4.8 E-Mail-Benachrichtigungen</h3>
          <p>
            Sofern die E-Mail-Benachrichtigung serverseitig konfiguriert ist,
            wird die E-Mail-Adresse der nutzenden Person verwendet, um
            automatische Benachrichtigungen über den Abschluss oder das
            Fehlschlagen eines Reviews zu versenden. Der Versand erfolgt über
            einen SMTP-Server innerhalb der TUM-Infrastruktur.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e
            DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG. Die
            zeitnahe Information der Nutzenden über den Abschluss einer
            angeforderten Analyse ist zur Aufgabenerfüllung erforderlich.
          </p>

          <h3>4.9 Leistungsmetriken (Check Performance)</h3>
          <p>
            Für jede KI-Prüfgruppe werden technische Leistungskennzahlen
            erfasst (Dauer, Token-Verbrauch, Status). Diese Daten sind
            der jeweiligen Review-ID zugeordnet, enthalten jedoch keine
            direkt personenbezogenen Informationen.
          </p>
          <p>
            <strong>Zweck:</strong> Qualitätssicherung, Optimierung der
            KI-Analyse, Ressourcenplanung.
          </p>

          <h2>5. Empfänger und Auftragsverarbeitung</h2>

          <h3>5.1 Technischer Betrieb</h3>
          <p>
            Der technische Betrieb der Anwendung erfolgt auf der
            Kubernetes-Infrastruktur der TUM, betrieben durch den Lehrstuhl AET.
            Die zugrunde liegende Infrastruktur wird durch die{" "}
            <a href="https://www.cit.tum.de/ito/die-ito/" target="_blank" rel="noopener noreferrer">
              IT-Organisation (ITO)
            </a>{" "}
            der Technischen Universität München bereitgestellt.
          </p>
          <p>
            IT-Organisation (ITO)<br />
            Boltzmannstraße 3<br />
            85748 Garching bei München<br />
            Telefon: +49-(0)89-289-18018<br />
            E-Mail: ito(at)cit.tum.de
          </p>

          <h3>5.2 Azure OpenAI (Microsoft)</h3>
          <p>
            Wird als KI-Anbieter &bdquo;Azure OpenAI&ldquo; gewählt, werden die
            Textinhalte der hochgeladenen Dokumente sowie gerenderte
            Seitenbilder (PNG) an den Microsoft Azure OpenAI Service
            übermittelt. Es gilt:
          </p>
          <ul>
            <li>
              Die Verarbeitung erfolgt im Rahmen eines bestehenden
              Auftragsverarbeitungsvertrags (AVV) zwischen der TUM und
              Microsoft gemäß Art.&nbsp;28 DSGVO.
            </li>
            <li>
              Die Datenverarbeitung erfolgt in Rechenzentren innerhalb der
              Europäischen Union. Ihre Daten verlassen nicht die EU.
            </li>
            <li>
              Microsoft verpflichtet sich vertraglich, die übermittelten Daten
              nicht für eigene Zwecke (z.&nbsp;B. Modelltraining) zu verwenden.
            </li>
            <li>
              Die Daten werden nur zur Verarbeitung an Azure gesendet und dort
              nicht dauerhaft gespeichert.
            </li>
            <li>Alle Datenübertragungen erfolgen verschlüsselt (TLS).</li>
          </ul>

          <h3>5.3 Ollama (On-Premises)</h3>
          <p>
            Wird als KI-Anbieter &bdquo;Ollama&ldquo; gewählt, erfolgt die
            gesamte KI-Verarbeitung auf GPU-Infrastruktur der TUM. Es findet
            keine Übermittlung an Dritte statt. Ihre Daten verlassen nicht das
            Netzwerk der Universität.
          </p>

          <h3>5.4 Sonstige Empfänger</h3>
          <p>
            Darüber hinaus werden keine personenbezogenen Daten an Dritte
            weitergegeben.
          </p>
          <p>
            Gegebenenfalls werden Ihre Daten an die zuständigen Aufsichts- und
            Rechnungsprüfungsbehörden zur Wahrnehmung der jeweiligen
            Kontrollrechte übermittelt.
          </p>
          <p>
            Zur Abwehr von Gefahren für die Sicherheit in der
            Informationstechnik können bei elektronischer Übermittlung Daten an
            das Landesamt für Sicherheit in der Informationstechnik
            weitergeleitet und dort auf Grundlage der Art.&nbsp;12&nbsp;ff. des
            Bayerischen E-Government-Gesetzes verarbeitet werden.
          </p>

          <h2>6. Zugriffskontrolle und Dateneinsicht</h2>
          <p>
            Der Zugriff auf Reviews ist wie folgt geregelt:
          </p>
          <ul>
            <li>
              <strong>Studierende</strong> sehen ausschließlich ihre eigenen
              Reviews.
            </li>
            <li>
              <strong>Betreuende (PhD/Promovierende)</strong> können zusätzlich
              Reviews von ihnen zugeordneten Studierenden einsehen, um die
              Betreuung zu unterstützen.
            </li>
            <li>
              <strong>Administrierende</strong> haben Zugriff auf alle Reviews
              zu administrativen und technischen Zwecken.
            </li>
          </ul>
          <p>
            Darüber hinaus können Nutzende einzelne Reviews über
            zeitlich begrenzte, optional passwortgeschützte Share-Links mit
            Dritten teilen. Die Verantwortung für die Weitergabe solcher Links
            liegt bei der nutzenden Person.
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
                <td>Nutzerdaten (Name, E-Mail, Rolle)</td>
                <td>
                  Dauer der aktiven Nutzung; auf Antrag oder bei
                  Exmatrikulation löschbar
                </td>
              </tr>
              <tr>
                <td>Authentifizierungsdaten (JWT-Session-Cookie)</td>
                <td>
                  Maximal 8 Stunden; wird beim Abmelden oder nach Ablauf der
                  Sitzung gelöscht
                </td>
              </tr>
              <tr>
                <td>Sitzungsdaten (In-Memory SSE)</td>
                <td>Maximal 1 Stunde nach letzter Aktivität</td>
              </tr>
              <tr>
                <td>Rate-Limiting-Daten (In-Memory)</td>
                <td>Maximal 1 Stunde (gleitendes Zeitfenster)</td>
              </tr>
              <tr>
                <td>Hochgeladene PDF-Dokumente</td>
                <td>
                  Bis zur manuellen Löschung durch die nutzende Person oder
                  die Administration
                </td>
              </tr>
              <tr>
                <td>Review-Ergebnisse und Annotationen</td>
                <td>
                  Bis zur manuellen Löschung durch die nutzende Person oder
                  die Administration
                </td>
              </tr>
              <tr>
                <td>Audit-Log-Einträge</td>
                <td>
                  Lebensdauer des zugehörigen Reviews
                </td>
              </tr>
              <tr>
                <td>Gerenderte Seitenbilder (PNG)</td>
                <td>
                  Temporär während der Analyse; werden unmittelbar nach
                  Abschluss gelöscht
                </td>
              </tr>
              <tr>
                <td>localStorage-Daten im Browser</td>
                <td>
                  Bis zur manuellen Löschung durch die nutzende Person im
                  Browser
                </td>
              </tr>
            </tbody>
          </table>

          <h2>8. Cookies und lokale Speicherung</h2>

          <h3>8.1 Cookies</h3>
          <p>
            Diese Anwendung verwendet ausschließlich <strong>technisch
            notwendige Cookies</strong>:
          </p>
          <ul>
            <li>
              <strong>Sitzungscookie (Session-Token):</strong> Enthält ein
              JWT-Token zur Authentifizierung. Gültig für maximal 8 Stunden
              bzw. bis zum Abmelden. Ist für die Funktion der Anwendung
              zwingend erforderlich.
            </li>
          </ul>
          <p>
            Es werden <strong>keine</strong> Analyse-, Tracking- oder
            Werbe-Cookies verwendet. Es werden <strong>keine</strong>{" "}
            Drittanbieter-Skripte eingebunden.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e
            DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG. Technisch
            notwendige Cookies sind zur Bereitstellung des Dienstes erforderlich
            und bedürfen keiner Einwilligung gemäß &sect;&nbsp;25 Abs.&nbsp;2
            Nr.&nbsp;2 TDDDG.
          </p>

          <h3>8.2 Lokale Speicherung (localStorage)</h3>
          <p>
            Im lokalen Speicher des Browsers werden folgende Einstellungen
            gesichert, um die Benutzererfahrung bei erneutem Besuch zu
            verbessern:
          </p>
          <ul>
            <li>
              <strong>Anbieterpräferenz:</strong> Der zuletzt gewählte
              KI-Anbieter (Azure/Ollama).
            </li>
            <li>
              <strong>Review-Modus:</strong> Die gewählte Analyse-Art
              (Proposal/Thesis).
            </li>
            <li>
              <strong>Ausgewählte Prüfgruppen:</strong> Die zuletzt gewählte
              Kombination von Prüfkategorien.
            </li>
            <li>
              <strong>Onboarding-Status:</strong> Ob die Einführungstour bereits
              durchlaufen wurde.
            </li>
          </ul>
          <p>
            Diese Daten werden ausschließlich lokal im Browser gespeichert und
            nicht an den Server übermittelt. Sie können jederzeit über die
            Browser-Einstellungen gelöscht werden.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> &sect;&nbsp;25 Abs.&nbsp;2
            Nr.&nbsp;2 TDDDG (technisch erforderliche Speicherung zur
            Bereitstellung eines vom Nutzer ausdrücklich gewünschten Dienstes).
          </p>

          <h2>9. Datenübermittlung in Drittstaaten</h2>
          <p>
            Bei Nutzung des KI-Anbieters &bdquo;Azure OpenAI&ldquo; erfolgt die
            Verarbeitung ausschließlich in Rechenzentren innerhalb der
            Europäischen Union. Eine Übermittlung personenbezogener Daten in
            Drittstaaten (außerhalb des EWR) findet nicht statt.
          </p>
          <p>
            Bei Nutzung des KI-Anbieters &bdquo;Ollama&ldquo; verlassen die
            Daten nicht das Netzwerk der TUM.
          </p>

          <h2>10. Automatisierte Entscheidungsfindung</h2>
          <p>
            Die KI-gestützte Analyse stellt keine automatisierte
            Entscheidungsfindung im Sinne von Art.&nbsp;22 DSGVO dar. Die
            Ergebnisse der Analyse sind rein informativ und dienen als
            Unterstützung für die Nutzenden. Es findet kein Profiling statt.
            Aus den Ergebnissen werden keine verbindlichen Entscheidungen
            abgeleitet — die finale Bewertung obliegt stets den zuständigen
            Lehrpersonen.
          </p>

          <h2>11. Ihre Rechte</h2>
          <p>
            Als betroffene Person stehen Ihnen gemäß der DSGVO folgende Rechte
            zu:
          </p>
          <ul>
            <li>
              <strong>Auskunftsrecht (Art.&nbsp;15 DSGVO):</strong>{" "}
              Sie haben das Recht auf Auskunft über die zu Ihrer Person
              gespeicherten Daten.
            </li>
            <li>
              <strong>Recht auf Berichtigung (Art.&nbsp;16 DSGVO):</strong>{" "}
              Sollten unrichtige personenbezogene Daten verarbeitet werden,
              steht Ihnen ein Recht auf Berichtigung zu.
            </li>
            <li>
              <strong>Recht auf Löschung (Art.&nbsp;17 DSGVO):</strong>{" "}
              Liegen die gesetzlichen Voraussetzungen vor, können Sie die
              Löschung Ihrer Daten verlangen. Sie können Ihre Reviews
              eigenständig in der Anwendung löschen (Selbstlöschungsfunktion).
              Darüber hinausgehende Löschungsanfragen richten Sie bitte an die
              oben genannten Kontaktstellen.
            </li>
            <li>
              <strong>Recht auf Einschränkung der Verarbeitung
              (Art.&nbsp;18 DSGVO):</strong>{" "}
              Unter bestimmten Voraussetzungen können Sie die Einschränkung der
              Verarbeitung Ihrer Daten verlangen.
            </li>
            <li>
              <strong>Recht auf Datenübertragbarkeit
              (Art.&nbsp;20 DSGVO):</strong>{" "}
              Wenn Sie in die Verarbeitung eingewilligt haben oder ein Vertrag
              zur Datenverarbeitung besteht und die Verarbeitung mithilfe
              automatisierter Verfahren durchgeführt wird, steht Ihnen
              gegebenenfalls ein Recht auf Datenübertragbarkeit zu.
            </li>
            <li>
              <strong>Widerspruchsrecht (Art.&nbsp;21 DSGVO):</strong>{" "}
              Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen
              Situation ergeben, jederzeit gegen die Verarbeitung Ihrer Daten
              Widerspruch einzulegen, wenn die Verarbeitung auf Grundlage des
              Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;e DSGVO erfolgt.
            </li>
            <li>
              <strong>Recht auf Widerruf der Einwilligung
              (Art.&nbsp;7 Abs.&nbsp;3 DSGVO):</strong>{" "}
              Falls Sie in die Verarbeitung eingewilligt haben, können Sie die
              Einwilligung jederzeit für die Zukunft widerrufen. Die
              Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung wird
              dadurch nicht berührt.
            </li>
          </ul>
          <p>
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an die oben
            genannte fachlich verantwortliche Stelle oder an den
            Datenschutzbeauftragten der TUM.
          </p>

          <h2>12. Beschwerderecht bei der Aufsichtsbehörde</h2>
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

          <h2>13. Datensicherheit</h2>
          <p>
            Wir treffen angemessene technische und organisatorische Maßnahmen,
            um Ihre Daten zu schützen:
          </p>
          <ul>
            <li>
              Die Kommunikation mit dieser Anwendung erfolgt ausschließlich über
              verschlüsselte Verbindungen (HTTPS/TLS). Die TLS-Zertifikate
              werden automatisiert über{" "}
              <a href="https://letsencrypt.org/" target="_blank" rel="noopener noreferrer">
                Let&apos;s Encrypt
              </a>{" "}
              bezogen und regelmäßig erneuert.
            </li>
            <li>
              Die Infrastruktur wird innerhalb des TUM-Netzwerks auf einem
              Kubernetes-Cluster betrieben.
            </li>
            <li>
              Der Zugang zur Datenbank (PostgreSQL) und zu den gespeicherten
              Dokumenten ist auf die Anwendung beschränkt und nicht öffentlich
              zugänglich.
            </li>
            <li>
              Die Authentifizierung erfolgt über das bewährte Keycloak-SSO
              der TUM mit JWT-basierter Sitzungsverwaltung.
            </li>
            <li>
              Share-Links können mit Ablaufdatum und optionalem Passwortschutz
              versehen werden. Passwörter werden nur als kryptographischer Hash
              gespeichert.
            </li>
            <li>
              Die Löschung von Reviews erfolgt als Soft-Delete, um
              versehentliche Datenverluste zu vermeiden; die Daten werden bei
              Datenbankabrufen nicht mehr berücksichtigt.
            </li>
          </ul>

          <h2>14. Änderungen dieser Datenschutzerklärung</h2>
          <p>
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie
            an geänderte Rechtslagen oder bei Änderungen der Anwendung oder der
            Datenverarbeitung aktuell zu halten. Die jeweils aktuelle Fassung
            ist stets über die Anwendung abrufbar.
          </p>

          <h2>15. Weitere Informationen</h2>
          <p>
            Für nähere Informationen zur Verarbeitung Ihrer Daten und zu Ihren
            Rechten können Sie uns unter den oben genannten Kontaktdaten der
            fachlich verantwortlichen Stelle erreichen.
          </p>
          <p>
            <em>Stand: März 2026</em>
          </p>

          <GdprActions isAuthenticated={isAuthenticated} />
        </main>

        <Footer />
      </div>
    </div>
  );
}
