"use client";

import { useState } from "react";
import { GraduationCap, ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { GdprActions } from "@/components/gdpr-actions";

type Lang = "de" | "en";

function LanguageSwitcher({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
      <Globe className="ml-1.5 h-3.5 w-3.5 text-white/40" />
      <button
        onClick={() => setLang("de")}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
          lang === "de"
            ? "bg-blue-500/20 text-blue-300"
            : "text-white/40 hover:text-white/60"
        }`}
      >
        DE
      </button>
      <button
        onClick={() => setLang("en")}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
          lang === "en"
            ? "bg-blue-500/20 text-blue-300"
            : "text-white/40 hover:text-white/60"
        }`}
      >
        EN
      </button>
    </div>
  );
}

const PROSE_CLASSES = "prose prose-invert prose-sm max-w-none rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white/90 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white/80 [&_p]:text-white/60 [&_li]:text-white/60 [&_strong]:text-white/70 [&_table]:text-white/60 [&_th]:text-white/70 [&_td]:border-white/10 [&_th]:border-white/10 [&_a]:text-blue-400 [&_a:hover]:text-blue-300";

function PrivacyDE() {
  return (
    <main className={PROSE_CLASSES}>
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
      <p>Verantwortlich für die Datenverarbeitung ist:</p>
      <p>
        Technische Universität München<br />
        Postanschrift: Arcisstraße 21, 80333 München<br />
        Telefon: +49-(0)89-289-01<br />
        E-Mail: poststelle(at)tum.de
      </p>
      <p>
        Die Technische Universität München ist eine Körperschaft des
        öffentlichen Rechts. Sie wird gesetzlich vertreten durch den Präsidenten.
      </p>
      <p><strong>Fachlich verantwortliche Stelle:</strong></p>
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
      <p>Der/die Datenschutzbeauftragte der Technischen Universität München ist erreichbar unter:</p>
      <p>
        Technische Universität München<br />
        Behördlicher Datenschutzbeauftragter<br />
        Postanschrift: Arcisstraße 21, 80333 München<br />
        Telefon: +49-(0)89-289-17052<br />
        E-Mail: beauftragter(at)datenschutz.tum.de
      </p>
      <p>
        Weitere Informationen zum Datenschutz an der TUM:{" "}
        <a href="https://www.tum.de/datenschutz" target="_blank" rel="noopener noreferrer">www.tum.de/datenschutz</a>
      </p>

      <h2>3. Zweck und Rechtsgrundlagen der Verarbeitung</h2>
      <h3>3.1 Zweck der Anwendung</h3>
      <p>
        Diese Webanwendung dient der KI-gestützten Überprüfung von Thesis-Proposals und vollständigen Abschlussarbeiten im Rahmen der Lehre, Betreuung und Qualitätssicherung des Lehrangebots des Lehrstuhls AET. Studierende und wissenschaftliche Mitarbeitende können PDF-Dokumente hochladen, die automatisiert durch KI-Modelle analysiert werden. Die Ergebnisse werden als strukturiertes, unverbindliches Feedback zurückgegeben. Die Nutzung der Anwendung ist freiwillig.
      </p>
      <p>
        Eine Nutzung der hochgeladenen Inhalte oder Review-Ergebnisse zu eigenständigen Forschungszwecken erfolgt im Rahmen dieser Datenschutzerklärung nicht. Soweit zukünftig eine Nutzung zu Forschungszwecken vorgesehen ist, erfolgt dies nur auf Grundlage einer gesonderten Information und, soweit erforderlich, einer gesonderten Einwilligung.
      </p>
      <h3>3.2 Rechtsgrundlagen</h3>
      <p>Die Rechtsgrundlage für die Verarbeitung ergibt sich, soweit nichts anderes angegeben ist, aus:</p>
      <ul>
        <li>
          <strong>Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG</strong> (Wahrnehmung einer Aufgabe im öffentlichen Interesse): Die Verarbeitung ist für die Erfüllung der Lehraufgaben der Universität erforderlich. Aufgabennorm ist insbesondere Art.&nbsp;2 des{" "}
          <a href="https://www.gesetze-bayern.de/Content/Document/BayHIG-2" target="_blank" rel="noopener noreferrer">Bayerischen Hochschulinnovationsgesetzes (BayHIG)</a>; ergänzend Art.&nbsp;3 Abs.&nbsp;1 BayHIG. Die Nutzung des Proposal Checkers ist freiwillig und ersetzt keine Betreuung, Bewertung oder Prüfungsleistung. Prüfungs- und Studienordnungen der TUM, insbesondere die{" "}
          <a href="https://www.tum.de/studium/im-studium/das-studium-organisieren/satzungen-ordnungen" target="_blank" rel="noopener noreferrer">Allgemeine Prüfungs- und Studienordnung (APSO)</a>{" "}
          und die jeweils einschlägige Fachprüfungs- und Studienordnung (FPSO), bleiben für Abschlussarbeiten unabhängig hiervon unberührt.
        </li>
        <li>
          <strong>Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;a DSGVO</strong> (Einwilligung): Die konkrete KI-Analyse des hochgeladenen Dokuments einschließlich der Übermittlung der hierfür erforderlichen Inhalte an den jeweils gewählten KI-Anbieter erfolgt nur nach aktiver Einwilligung durch Anhaken der Einwilligungs-Checkbox vor dem Start der Analyse. Ohne diese Einwilligung kann keine Analyse gestartet werden. Die Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden; die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt davon unberührt. Nach Widerruf werden keine weiteren KI-Analysen auf Grundlage dieser Einwilligung durchgeführt.
        </li>
        <li>
          <strong>Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;c DSGVO</strong> (Erfüllung einer rechtlichen Verpflichtung): Übermittlungen an die Datenschutzaufsicht, an Rechnungsprüfungsbehörden und an das Bayerische Landesamt für Sicherheit in der Informationstechnik (LSI) erfolgen aufgrund gesetzlicher Auskunfts-, Vorlage-, Mitwirkungs-, Unterrichtungs- und Unterstützungspflichten. Konkretisierende Fachnormen sind insbesondere Art.&nbsp;31 und Art.&nbsp;58 Abs.&nbsp;1 DSGVO sowie Art.&nbsp;16 Abs.&nbsp;1 BayDSG (Datenschutzaufsicht), Art.&nbsp;111 Abs.&nbsp;1 i.&nbsp;V.&nbsp;m. Art.&nbsp;89 bis 99, insbesondere Art.&nbsp;95 BayHO (Rechnungsprüfung), sowie Art.&nbsp;43 Abs.&nbsp;3 Satz&nbsp;1 und Abs.&nbsp;4 BayDiG i.&nbsp;V.&nbsp;m. Art.&nbsp;42 Abs.&nbsp;1 Nr.&nbsp;1, 2, 4 und 5 BayDiG (LSI).
        </li>
      </ul>

      <h3>3.3 Freiwilligkeit der Bereitstellung</h3>
      <p>Die Bereitstellung der Daten ist weder gesetzlich noch vertraglich vorgeschrieben. Sie sind nicht verpflichtet, die Daten bereitzustellen. Die Nichtbereitstellung hat ausschließlich zur Folge, dass die KI-gestützte Analyse nicht angeboten werden kann; ein Nachteil im Studium oder in der Betreuung entsteht hierdurch nicht.</p>

      <h2>4. Erhobene Daten und Verarbeitungszwecke</h2>
      <h3>4.1 Authentifizierungsdaten</h3>
      <p>Bei der Anmeldung über den zentralen Identitätsanbieter der TUM (Keycloak OIDC Single Sign-On) werden folgende Daten erhoben und in der Nutzertabelle der Anwendung gespeichert:</p>
      <ul>
        <li>TUM-Kennung (Benutzer-ID)</li>
        <li>Vor- und Nachname</li>
        <li>E-Mail-Adresse</li>
        <li>Rollenzugehörigkeit (z.&nbsp;B. Studierende, Promovierende, Administrierende) — abgeleitet aus dem Keycloak-Zugriffstoken</li>
      </ul>
      <p><strong>Zweck:</strong> Zugangssteuerung, Zuordnung von Reviews zu Nutzenden, rollenbasierte Berechtigungen (z.&nbsp;B. Zugang zu KI-Anbietern, Einsicht in zugeordnete Reviews).</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG. Die Authentifizierung ist technisch erforderlich, um den Zugang zur Plattform zu verwalten und die Integrität des Lehrbetriebs zu gewährleisten.</p>
      <p><strong>Speicherdauer:</strong> Nutzerdaten werden für die Dauer der aktiven Nutzung der Plattform gespeichert. Bei Exmatrikulation oder auf Antrag werden die Daten gelöscht, sofern keine gesetzlichen Aufbewahrungsfristen entgegenstehen.</p>

      <h3>4.2 Hochgeladene Dokumente</h3>
      <p>Nutzerinnen und Nutzer laden PDF-Dokumente (Thesis-Proposals oder vollständige Abschlussarbeiten) hoch. Diese werden auf persistentem Speicher innerhalb des Kubernetes-Clusters der TUM gespeichert.</p>
      <p><strong>Zweck:</strong> Inhaltliche Analyse durch KI-Modelle zur Generierung von Feedback. Zudem ermöglicht die Speicherung die erneute Analyse (Retry) oder die Einreichung von Folgeversionen.</p>
      <p><strong>Hinweis:</strong> Die hochgeladenen Dokumente können personenbezogene Daten enthalten (z.&nbsp;B. Autorennamen, Matrikelnummern). Nutzerinnen und Nutzer werden gebeten, nur die für die Überprüfung notwendigen Inhalte im Dokument zu belassen. Vor dem Upload soll geprüft werden, ob das Dokument personenbezogene Daten Dritter, besondere Kategorien personenbezogener Daten im Sinne von Art.&nbsp;9 DSGVO, vertrauliche Unternehmensinformationen oder nicht anonymisierte Forschungs-, Interview- oder Umfragedaten enthält. Solche Inhalte sollen vor dem Upload entfernt oder anonymisiert werden, soweit sie für die Analyse nicht erforderlich sind oder keine Berechtigung zur Verarbeitung besteht.</p>
      <p><strong>Speicherdauer:</strong> Bis zur Löschung durch die nutzende Person (Selbstlöschung in der Anwendung) oder durch die Administration.</p>

      <h3>4.3 KI-Analyse und Bildverarbeitung</h3>
      <p>Im Rahmen der Analyse werden folgende Verarbeitungsschritte durchgeführt:</p>
      <ul>
        <li><strong>Textextraktion:</strong> Der Textinhalt der PDF-Seiten wird maschinell extrahiert.</li>
        <li><strong>Seitenrendering:</strong> Die Seiten des PDF-Dokuments werden serverseitig als PNG-Bilder gerendert (mittels Poppler/pdftoppm), um dem KI-Modell eine visuelle Analyse (z.&nbsp;B. Abbildungen, Seitenlayout, Struktur) zu ermöglichen.</li>
        <li><strong>KI-Verarbeitung:</strong> Sowohl der extrahierte Text als auch die gerenderten Seitenbilder werden an das gewählte KI-Modell (Azure OpenAI oder ein selbst gehostetes Open-Source-Modell auf TUM-Infrastruktur) übermittelt. Die Analyse erfolgt in 7 parallelen Prüfgruppen (z.&nbsp;B. Struktur, Problemstellung, Literaturverzeichnis, Abbildungen, Schreibstil, KI-Transparenz, Zeitplan), gefolgt von einem Zusammenführungsschritt.</li>
      </ul>
      <p><strong>Rechtsgrundlage:</strong> Rechtsgrundlage für die konkrete KI-Analyse einschließlich der Übermittlung der hierfür erforderlichen Inhalte an den gewählten KI-Anbieter ist Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;a DSGVO. Die Einwilligung wird vor jedem Start der Analyse durch aktives Anhaken der entsprechenden Checkbox erteilt.</p>
      <p>Die gerenderten PNG-Bilder werden ausschließlich temporär im Arbeitsspeicher bzw. im temporären Dateisystem des Servers erzeugt und nach Abschluss der Analyse gelöscht.</p>

      <h3>4.4 Review-Daten</h3>
      <p>Zu jedem durchgeführten Review werden in der Datenbank gespeichert:</p>
      <ul>
        <li>Zuordnung zur einreichenden Person (Benutzer-ID, E-Mail, Name)</li>
        <li>Zeitpunkt der Einreichung und Fertigstellung</li>
        <li>Gewählter KI-Anbieter und Review-Modus (Proposal/Thesis)</li>
        <li>Ergebnisse der KI-Analyse (Feedback-Items, Bewertungen)</li>
        <li>Annotationen (z.&nbsp;B. Markierungen einzelner Ergebnisse als erledigt, abgelehnt, oder bestätigt)</li>
        <li>Kommentare und Diskussionsfäden zu einzelnen Ergebnissen</li>
        <li>Ggf. Zuordnung zu Betreuer/in und Studierender/m (Supervisor-Student-Beziehung)</li>
        <li>Share-Links (Token, Ablaufdatum, ggf. Passwort-Hash)</li>
        <li>Inhaltshash (SHA-256) zur Duplikaterkennung</li>
      </ul>
      <p><strong>Zweck:</strong> Nachvollziehbarkeit, erneuter Abruf vergangener Reviews, Betreuungsunterstützung, Versionsverlauf.</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e, Abs.&nbsp;3 DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG sowie den in Abschnitt&nbsp;3.2 genannten hochschulrechtlichen Aufgabennormen. Soweit Review-Daten unmittelbar im Rahmen der konkreten KI-Analyse erzeugt werden, beruht diese Erzeugung zusätzlich auf der vor dem Analysebeginn erteilten Einwilligung.</p>
      <p><strong>Speicherdauer:</strong> Bis zur Löschung durch die nutzende Person oder die Administration.</p>

      <h3>4.5 Sitzungsdaten</h3>
      <p>Während der aktiven Nutzung werden temporäre Sitzungsdaten im Arbeitsspeicher des Servers gehalten. Diese umfassen den Fortschritt der laufenden Analyse (Server-Sent Events) und werden automatisch nach spätestens einer Stunde gelöscht.</p>

      <h3>4.6 Audit-Protokollierung</h3>
      <p>Zur Nachvollziehbarkeit und Sicherheit werden bestimmte Nutzeraktionen in einem Audit-Log protokolliert. Dabei werden folgende Daten erfasst:</p>
      <ul>
        <li>Benutzer-ID, E-Mail-Adresse und Name der handelnden Person</li>
        <li>Art der Aktion (z.&nbsp;B. Review erstellt, gelöscht, geteilt, Annotation geändert, Kommentar hinzugefügt)</li>
        <li>Zeitpunkt der Aktion</li>
        <li>Zusätzliche kontextbezogene Details (z.&nbsp;B. gewählter Anbieter, Dateiname)</li>
      </ul>
      <p><strong>Zweck:</strong> Nachvollziehbarkeit von Änderungen, Missbrauchserkennung, Unterstützung bei der Fehleranalyse.</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e, Abs.&nbsp;3 DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG; für die Prüfung und Wartung automatisierter Verfahren der Datenverarbeitung sowie zur Gewährleistung der Netz- und Informationssicherheit zusätzlich Art.&nbsp;6 Abs.&nbsp;1 BayDSG. Die Sicherheitsmaßnahmen werden nach Art.&nbsp;32 DSGVO ausgestaltet.</p>
      <p><strong>Speicherdauer:</strong> Audit-Log-Einträge werden für die Lebensdauer des zugehörigen Reviews gespeichert und bei dessen Löschung automatisch entfernt.</p>

      <h3>4.7 Rate-Limiting</h3>
      <p>Zum Schutz vor Überlastung werden Benutzer-IDs und Zeitstempel von Review-Anfragen im Arbeitsspeicher des Servers in einem gleitenden Zeitfenster (standardmäßig 1 Stunde) vorgehalten. Es werden keine IP-Adressen zu diesem Zweck erhoben.</p>
      <p><strong>Zweck:</strong> Schutz der Infrastruktur vor Überlastung und Missbrauch.</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e, Abs.&nbsp;3 DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG; zur Gewährleistung der Netz- und Informationssicherheit zusätzlich Art.&nbsp;6 Abs.&nbsp;1 BayDSG.</p>
      <p><strong>Speicherdauer:</strong> Die Daten werden automatisch nach Ablauf des Zeitfensters (max. 1 Stunde) aus dem Arbeitsspeicher entfernt.</p>

      <h3>4.8 Leistungsmetriken (Check Performance)</h3>
      <p>Für jede KI-Prüfgruppe werden technische Leistungskennzahlen erfasst, insbesondere Dauer, Token-Verbrauch und Status der Verarbeitung. Diese Daten enthalten keine Inhaltsdaten des hochgeladenen Dokuments. Da sie jedoch der jeweiligen Review-ID zugeordnet sind, können sie mittelbar einer nutzenden Person zugeordnet werden.</p>
      <p><strong>Zweck:</strong> Qualitätssicherung, Fehleranalyse, Optimierung der KI-Analyse und Ressourcenplanung.</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e, Abs.&nbsp;3 DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG. Soweit Leistungsmetriken ausschließlich aggregiert oder anonymisiert ausgewertet werden, erfolgt keine Verarbeitung personenbezogener Daten mehr.</p>
      <p><strong>Speicherdauer:</strong> Leistungsmetriken werden für die Lebensdauer des zugehörigen Reviews gespeichert und bei dessen Löschung automatisch entfernt.</p>

      <h3>4.9 Server- und Zugriffsprotokolle</h3>
      <p>Beim Zugriff auf die Anwendung können technisch erforderliche Server- und Zugriffsprotokolle verarbeitet werden. Diese können insbesondere Zeitpunkt des Zugriffs, aufgerufene Ressource, HTTP-Statuscode, technische Fehlerinformationen, User-Agent und IP-Adresse enthalten.</p>
      <p><strong>Zweck:</strong> Sicherstellung des technischen Betriebs, Fehleranalyse, Missbrauchserkennung und Gewährleistung der Netz- und Informationssicherheit.</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e, Abs.&nbsp;3 DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG; zur Gewährleistung der Netz- und Informationssicherheit zusätzlich Art.&nbsp;6 Abs.&nbsp;1 BayDSG.</p>
      <p><strong>Speicherdauer:</strong> Server- und Zugriffsprotokolle werden nur so lange gespeichert, wie dies für die genannten Zwecke erforderlich ist; die konkrete Speicherdauer richtet sich nach dem technischen Logging- und Betriebskonzept.</p>

      <h2>5. Empfänger und Auftragsverarbeitung</h2>
      <h3>5.1 Technischer Betrieb</h3>
      <p>Der technische Betrieb der Anwendung erfolgt auf der Kubernetes-Infrastruktur der TUM, betrieben durch den Lehrstuhl AET. Die zugrunde liegende Infrastruktur wird durch die{" "}<a href="https://www.cit.tum.de/ito/die-ito/" target="_blank" rel="noopener noreferrer">IT-Organisation (ITO)</a>{" "}der Technischen Universität München bereitgestellt.</p>
      <p>IT-Organisation (ITO)<br />Boltzmannstraße 3<br />85748 Garching bei München<br />Telefon: +49-(0)89-289-18018<br />E-Mail: ito(at)cit.tum.de</p>

      <h3>5.2 Azure OpenAI (Microsoft)</h3>
      <p>Wird als KI-Anbieter &bdquo;Azure OpenAI&ldquo; gewählt, werden die für die Analyse erforderlichen Textinhalte der hochgeladenen Dokumente sowie gerenderte Seitenbilder (PNG) an den Microsoft Azure OpenAI Service übermittelt. Es gilt:</p>
      <ul>
        <li>Microsoft handelt als Auftragsverarbeiter im Rahmen eines bestehenden Auftragsverarbeitungsvertrags (AVV) zwischen der TUM und Microsoft gemäß Art.&nbsp;28 DSGVO; Rechtsgrundlage der Übermittlung und KI-Verarbeitung ist die vor Beginn der Analyse erteilte Einwilligung nach Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;a DSGVO.</li>
        <li>Die Verarbeitung erfolgt grundsätzlich in der konfigurierten Azure-EU-Region bzw. Azure-Geografie. Die konkrete Verarbeitung und mögliche technische Zwischenspeicherung richten sich nach der eingesetzten Azure-Konfiguration, dem Deployment-Typ, den Microsoft-Produktbedingungen und den zwischen TUM und Microsoft vereinbarten Datenschutzbedingungen.</li>
        <li>Microsoft verarbeitet die übermittelten Inhalte zur Bereitstellung des Dienstes sowie zur Inhaltsfilterung und Missbrauchserkennung. Nach den Microsoft-Bedingungen werden Kundendaten aus Azure OpenAI nicht ohne entsprechende Berechtigung zur Verbesserung oder zum Training von Foundation Models verwendet.</li>
        <li>Zugriffe oder Übermittlungen an Microsoft-Konzernunternehmen in den USA können nicht vollständig ausgeschlossen werden. Soweit Empfänger in den USA nach dem EU-U.S. Data Privacy Framework zertifiziert sind, stützt sich eine Übermittlung auf den Angemessenheitsbeschluss (EU)&nbsp;2023/1795. Für nicht hiervon erfasste Übermittlungen werden Standardvertragsklauseln nach Art.&nbsp;46 Abs.&nbsp;2 Buchst.&nbsp;c DSGVO eingesetzt. Eine Kopie der Garantien kann bei der oben genannten verantwortlichen Stelle angefordert werden.</li>
        <li>Alle Datenübertragungen erfolgen verschlüsselt (TLS).</li>
      </ul>

      <h3>5.3 Selbst gehostetes lokales KI-Modell (On-Premises)</h3>
      <p>Wird als KI-Anbieter &bdquo;Local LLM&ldquo; gewählt, erfolgt die gesamte KI-Verarbeitung auf GPU-Infrastruktur der TUM. Es findet keine Übermittlung an Dritte statt. Ihre Daten verlassen nicht das Netzwerk der Universität.</p>

      <h3>5.4 Sonstige Empfänger</h3>
      <p>Darüber hinaus werden keine personenbezogenen Daten an Dritte weitergegeben.</p>
      <p>Gegebenenfalls werden Ihre Daten an die Datenschutzaufsicht und an Rechnungsprüfungsbehörden zur Wahrnehmung der jeweiligen Auskunfts-, Vorlage-, Mitwirkungs- oder Kontrollpflichten übermittelt. Rechtsgrundlage ist Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;c, Abs.&nbsp;3 DSGVO; für die Datenschutzaufsicht insbesondere Art.&nbsp;31 und Art.&nbsp;58 Abs.&nbsp;1 DSGVO sowie Art.&nbsp;16 Abs.&nbsp;1 BayDSG, für die Rechnungsprüfung insbesondere Art.&nbsp;111 Abs.&nbsp;1 i.&nbsp;V.&nbsp;m. Art.&nbsp;89 bis 99, insbesondere Art.&nbsp;95 BayHO; datenschutzrechtlich flankierend Art.&nbsp;5 Abs.&nbsp;1 Satz&nbsp;1 Nr.&nbsp;1, Abs.&nbsp;4 BayDSG und Art.&nbsp;6 Abs.&nbsp;1 BayDSG.</p>
      <p>Zur Abwehr von Gefahren für die Sicherheit in der Informationstechnik können bei elektronischer Übermittlung Daten an das Bayerische Landesamt für Sicherheit in der Informationstechnik (LSI) weitergeleitet werden. Rechtsgrundlage ist Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;c, Abs.&nbsp;3 DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;43 Abs.&nbsp;3 Satz&nbsp;1 und Abs.&nbsp;4 des Bayerischen Digitalgesetzes (BayDiG) sowie Art.&nbsp;42 Abs.&nbsp;1 Nr.&nbsp;1, 2, 4 und 5 BayDiG; bei Maßnahmen des Landesamts zusätzlich Art.&nbsp;44 Abs.&nbsp;1 und Abs.&nbsp;2 BayDiG.</p>

      <h2>6. Zugriffskontrolle und Dateneinsicht</h2>
      <p>Der Zugriff auf Reviews ist wie folgt geregelt:</p>
      <ul>
        <li><strong>Studierende</strong> sehen ausschließlich ihre eigenen Reviews.</li>
        <li><strong>Betreuende (PhD/Promovierende)</strong> können zusätzlich Reviews von ihnen zugeordneten Studierenden einsehen, um die Betreuung zu unterstützen.</li>
        <li><strong>Besonders berechtigte Administrierende</strong> können auf Reviews zugreifen, soweit dies für Betrieb, Support, Fehleranalyse, Sicherheit, Rechtebearbeitung oder administrative Aufgaben erforderlich ist.</li>
      </ul>
      <p>Darüber hinaus können Nutzende einzelne Reviews über zeitlich begrenzte, optional passwortgeschützte Share-Links mit Dritten teilen. Die Verantwortung für die Weitergabe solcher Links liegt bei der nutzenden Person.</p>
      <p>Welche Personengruppen Zugriff auf ein Review erhalten können &mdash; insbesondere die einreichende Person, zugeordnete Betreuende sowie besonders berechtigte Administrierende &mdash;, ist in dieser Datenschutzerklärung benannt und kann von Nutzenden vor dem Start einer Analyse nachvollzogen werden.</p>

      <h2>7. Speicherdauer und Löschung</h2>
      <table>
        <thead><tr><th>Datenart</th><th>Speicherdauer</th></tr></thead>
        <tbody>
          <tr><td>Nutzerdaten (Name, E-Mail, Rolle)</td><td>Dauer der aktiven Nutzung; auf Antrag oder nach Feststellung des Wegfalls der Nutzungsberechtigung löschbar, sofern keine gesetzlichen Aufbewahrungsfristen entgegenstehen</td></tr>
          <tr><td>Authentifizierungsdaten (JWT-Session-Cookie)</td><td>Maximal 8 Stunden; wird beim Abmelden oder nach Ablauf der Sitzung gelöscht</td></tr>
          <tr><td>Sitzungsdaten (In-Memory SSE)</td><td>Maximal 1 Stunde nach letzter Aktivität</td></tr>
          <tr><td>Rate-Limiting-Daten (In-Memory)</td><td>Maximal 1 Stunde (gleitendes Zeitfenster)</td></tr>
          <tr><td>Hochgeladene PDF-Dokumente</td><td>Bis zur Löschung durch die nutzende Person oder die Administration</td></tr>
          <tr><td>Review-Ergebnisse, Annotationen, Kommentare und Diskussionen</td><td>Bis zur Löschung durch die nutzende Person oder die Administration</td></tr>
          <tr><td>Leistungsmetriken</td><td>Lebensdauer des zugehörigen Reviews</td></tr>
          <tr><td>Audit-Log-Einträge</td><td>Lebensdauer des zugehörigen Reviews</td></tr>
          <tr><td>Gerenderte Seitenbilder (PNG)</td><td>Temporär während der Analyse; werden nach Abschluss der Analyse gelöscht</td></tr>
          <tr><td>localStorage-Daten im Browser</td><td>Bis zur manuellen Löschung durch die nutzende Person im Browser oder durch entsprechende Funktion in der Anwendung</td></tr>
        </tbody>
      </table>
      <p>Bei Betätigung der Löschfunktion werden Reviews in der Anwendung nicht mehr angezeigt und für reguläre Datenbankabrufe nicht mehr berücksichtigt. Soweit technisch zunächst eine Markierung als gelöscht (Soft-Delete) erfolgt, wird der Zugriff auf diese Daten auf besonders berechtigte Administrierende mit berechtigtem Anlass beschränkt. Eine endgültige Löschung aus dem Primärsystem erfolgt nach Maßgabe des technischen Löschkonzepts; Sicherungskopien werden im Rahmen der regulären Backup-Zyklen überschrieben oder gelöscht.</p>

      <h2>8. Cookies und lokale Speicherung</h2>
      <h3>8.1 Cookies</h3>
      <p>Diese Anwendung verwendet ausschließlich <strong>technisch notwendige Cookies</strong>:</p>
      <ul>
        <li><strong>Sitzungscookie (Session-Token):</strong> Enthält ein JWT-Token zur Authentifizierung. Gültig für maximal 8 Stunden bzw. bis zum Abmelden. Ist für die Funktion der Anwendung zwingend erforderlich.</li>
      </ul>
      <p>Es werden <strong>keine</strong> Analyse-, Tracking- oder Werbe-Cookies verwendet. Es werden <strong>keine</strong> Drittanbieter-Skripte eingebunden.</p>
      <p><strong>Rechtsgrundlage:</strong> Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e DSGVO i.&nbsp;V.&nbsp;m. Art.&nbsp;4 Abs.&nbsp;1 BayDSG. Technisch notwendige Cookies sind zur Bereitstellung des Dienstes erforderlich und bedürfen keiner Einwilligung gemäß &sect;&nbsp;25 Abs.&nbsp;2 Nr.&nbsp;2 TDDDG.</p>

      <h3>8.2 Lokale Speicherung (localStorage)</h3>
      <p>Im Browser werden lokal Nutzungseinstellungen gespeichert, um diese bei einem erneuten Besuch wiederherzustellen. Hierzu können insbesondere gehören:</p>
      <ul>
        <li><strong>Anbieterpräferenz:</strong> Der zuletzt gewählte KI-Anbieter (Azure / Local LLM).</li>
        <li><strong>Review-Modus:</strong> Die gewählte Analyse-Art (Proposal/Thesis).</li>
        <li><strong>Ausgewählte Prüfgruppen:</strong> Die zuletzt gewählte Kombination von Prüfkategorien.</li>
        <li><strong>Onboarding-Status:</strong> Ob die Einführungstour bereits durchlaufen wurde.</li>
      </ul>
      <p>Die lokale Speicherung erfolgt im Browser der nutzenden Person. Die gespeicherten Werte werden nicht automatisch beim bloßen Aufruf der Anwendung an den Server übermittelt. Startet die nutzende Person eine Analyse, werden die aktuell ausgewählten Einstellungen als Teil der Analyseanfrage an den Server übermittelt und beim Review gespeichert. Die lokal gespeicherten Daten können jederzeit über die Browser-Einstellungen gelöscht werden.</p>
      <p><strong>Rechtsgrundlage:</strong> Rechtsgrundlage für die Speicherung technisch erforderlicher Informationen in Endeinrichtungen ist &sect;&nbsp;25 Abs.&nbsp;2 Nr.&nbsp;2 TDDDG.</p>

      <h2>9. Datenübermittlung in Drittstaaten</h2>
      <p>Die primäre Verarbeitung über Azure OpenAI erfolgt in einer Microsoft-EU-Region. Soweit es zu Übermittlungen an Microsoft-Konzernteile in den USA kommen kann, stützen sich diese auf den Angemessenheitsbeschluss EU-U.S. Data Privacy Framework (Durchführungsbeschluss (EU)&nbsp;2023/1795) bzw. ergänzend auf Standardvertragsklauseln nach Art.&nbsp;46 DSGVO.</p>
      <p>Bei Auswahl des selbst gehosteten lokalen Modells verbleiben die Daten innerhalb des TUM-Netzwerks.</p>

      <h2>10. Automatisierte Entscheidungsfindung</h2>
      <p>Die KI-gestützte Analyse stellt keine automatisierte Entscheidungsfindung im Sinne von Art.&nbsp;22 DSGVO dar. Die Ergebnisse der Analyse sind rein informativ und dienen ausschließlich als unverbindliche Unterstützung für die Nutzenden.</p>
      <p>Das KI-Feedback ist kein Bestandteil einer formellen Bewertung, Prüfungsentscheidung oder Betreuungsentscheidung. Lehrpersonen und Betreuende dürfen Entscheidungen nicht ausschließlich oder maßgeblich auf das KI-Feedback stützen (vgl. EuGH, Urteil vom 07.12.2023, Rs. C-634/21). Die finale fachliche Bewertung obliegt stets den zuständigen Lehrpersonen bzw. Betreuenden.</p>
      <p>Es wird kein Profil über die nutzende Person erstellt. Die Analyse bezieht sich ausschließlich auf das hochgeladene Dokument und die darin enthaltenen Inhalte.</p>

      <h2>11. Ihre Rechte</h2>
      <p>Als betroffene Person stehen Ihnen gemäß der DSGVO folgende Rechte zu:</p>
      <ul>
        <li><strong>Auskunftsrecht (Art.&nbsp;15 DSGVO):</strong> Sie haben das Recht auf Auskunft über die zu Ihrer Person gespeicherten Daten.</li>
        <li><strong>Recht auf Berichtigung (Art.&nbsp;16 DSGVO):</strong> Sollten unrichtige personenbezogene Daten verarbeitet werden, steht Ihnen ein Recht auf Berichtigung zu.</li>
        <li><strong>Recht auf Löschung (Art.&nbsp;17 DSGVO):</strong> Liegen die gesetzlichen Voraussetzungen vor, können Sie die Löschung Ihrer Daten verlangen. Sie können Ihre Reviews eigenständig in der Anwendung löschen (Selbstlöschungsfunktion). Darüber hinausgehende Löschungsanfragen richten Sie bitte an die oben genannten Kontaktstellen.</li>
        <li><strong>Recht auf Einschränkung der Verarbeitung (Art.&nbsp;18 DSGVO):</strong> Unter bestimmten Voraussetzungen können Sie die Einschränkung der Verarbeitung Ihrer Daten verlangen.</li>
        <li><strong>Recht auf Datenübertragbarkeit (Art.&nbsp;20 DSGVO):</strong> Wenn Sie in die Verarbeitung eingewilligt haben oder ein Vertrag zur Datenverarbeitung besteht und die Verarbeitung mithilfe automatisierter Verfahren durchgeführt wird, steht Ihnen gegebenenfalls ein Recht auf Datenübertragbarkeit zu.</li>
        <li><strong>Widerspruchsrecht (Art.&nbsp;21 DSGVO):</strong> Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit gegen die Verarbeitung Ihrer Daten Widerspruch einzulegen, wenn die Verarbeitung auf Grundlage des Art.&nbsp;6 Abs.&nbsp;1 UAbs.&nbsp;1 Buchst.&nbsp;e DSGVO erfolgt.</li>
        <li><strong>Recht auf Widerruf der Einwilligung (Art.&nbsp;7 Abs.&nbsp;3 DSGVO):</strong> Falls Sie in die Verarbeitung eingewilligt haben, können Sie die Einwilligung jederzeit für die Zukunft widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung wird dadurch nicht berührt.</li>
      </ul>
      <p>Zur Ausübung Ihrer Rechte wenden Sie sich bitte an die oben genannte fachlich verantwortliche Stelle oder an den Datenschutzbeauftragten der TUM.</p>

      <h2>12. Beschwerderecht bei der Aufsichtsbehörde</h2>
      <p>Sie haben gemäß Art.&nbsp;77 DSGVO das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Die zuständige Aufsichtsbehörde ist:</p>
      <p>
        Bayerischer Landesbeauftragter für den Datenschutz (BayLfD)<br />
        Postanschrift: Postfach 22 12 19, 80502 München<br />
        Adresse: Wagmüllerstraße 18, 80538 München<br />
        Telefon: +49-(0)89-212672-0<br />
        E-Mail: poststelle(at)datenschutz-bayern.de<br />
        <a href="https://www.datenschutz-bayern.de" target="_blank" rel="noopener noreferrer">www.datenschutz-bayern.de</a>
      </p>

      <h2>13. Datensicherheit</h2>
      <p>Wir treffen angemessene technische und organisatorische Maßnahmen, um Ihre Daten zu schützen:</p>
      <ul>
        <li>Die Kommunikation mit dieser Anwendung erfolgt ausschließlich über verschlüsselte Verbindungen (HTTPS/TLS). Die TLS-Zertifikate werden automatisiert über{" "}<a href="https://letsencrypt.org/" target="_blank" rel="noopener noreferrer">Let&apos;s Encrypt</a>{" "}bezogen und regelmäßig erneuert.</li>
        <li>Die Infrastruktur wird innerhalb des TUM-Netzwerks auf einem Kubernetes-Cluster betrieben.</li>
        <li>Der Zugang zur Datenbank (PostgreSQL) und zu den gespeicherten Dokumenten ist auf die Anwendung beschränkt und nicht öffentlich zugänglich.</li>
        <li>Die Authentifizierung erfolgt über das bewährte Keycloak-SSO der TUM mit JWT-basierter Sitzungsverwaltung.</li>
        <li>Share-Links können mit Ablaufdatum und optionalem Passwortschutz versehen werden. Passwörter werden nur als kryptographischer Hash gespeichert.</li>
        <li>Bei Löschung eines Reviews wird dieses in der Anwendung nicht mehr angezeigt und bei regulären Datenbankabrufen nicht mehr berücksichtigt. Soweit technisch zunächst eine Soft-Delete-Markierung erfolgt, ist der Zugriff auf besonders berechtigte Administrierende mit berechtigtem Anlass beschränkt. Die endgültige Löschung erfolgt nach Maßgabe des technischen Löschkonzepts und der Backup-Zyklen.</li>
      </ul>

      <h2>14. Änderungen dieser Datenschutzerklärung</h2>
      <p>Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie an geänderte Rechtslagen oder bei Änderungen der Anwendung oder der Datenverarbeitung aktuell zu halten. Die jeweils aktuelle Fassung ist stets über die Anwendung abrufbar.</p>

      <h2>15. Weitere Informationen</h2>
      <p>Für nähere Informationen zur Verarbeitung Ihrer Daten und zu Ihren Rechten können Sie uns unter den oben genannten Kontaktdaten der fachlich verantwortlichen Stelle erreichen.</p>
      <p><em>Stand: 30. April 2026</em></p>
    </main>
  );
}

function PrivacyEN() {
  return (
    <main className={PROSE_CLASSES}>
      <p>
        The{" "}
        <a href="https://www.tum.de/" target="_blank" rel="noopener noreferrer">
          Technical University of Munich (TUM)
        </a>{" "}
        takes the protection of personal data very seriously. This privacy policy
        informs you about the nature, scope, and purpose of personal data
        processing when using the web application &ldquo;Proposal Checker&rdquo; at{" "}
        <a href="https://proposal.aet.cit.tum.de" target="_blank" rel="noopener noreferrer">
          proposal.aet.cit.tum.de
        </a>.
      </p>

      <h2>1. Name and Contact Details of the Controller</h2>
      <p>The controller responsible for data processing is:</p>
      <p>
        Technical University of Munich<br />
        Postal address: Arcisstraße 21, 80333 Munich, Germany<br />
        Phone: +49-(0)89-289-01<br />
        Email: poststelle(at)tum.de
      </p>
      <p>The Technical University of Munich is a public body. It is legally represented by its President.</p>
      <p><strong>Responsible department:</strong></p>
      <p>
        Chair for Applied Education Technologies (AET)<br />
        TUM School of Computation, Information and Technology<br />
        Department of Computer Science<br />
        Boltzmannstraße 3<br />
        85748 Garching bei München, Germany<br />
        Email: krusche(at)tum.de<br />
        Contact person: Prof. Dr. Stephan Krusche
      </p>

      <h2>2. Contact Details of the Data Protection Officer</h2>
      <p>The Data Protection Officer of the Technical University of Munich can be reached at:</p>
      <p>
        Technical University of Munich<br />
        Official Data Protection Officer<br />
        Postal address: Arcisstraße 21, 80333 Munich, Germany<br />
        Phone: +49-(0)89-289-17052<br />
        Email: beauftragter(at)datenschutz.tum.de
      </p>
      <p>
        Further information on data protection at TUM:{" "}
        <a href="https://www.tum.de/datenschutz" target="_blank" rel="noopener noreferrer">www.tum.de/datenschutz</a>
      </p>

      <h2>3. Purpose and Legal Basis of Processing</h2>
      <h3>3.1 Purpose of the Application</h3>
      <p>
        This web application provides AI-assisted review of thesis proposals and complete theses as part of the teaching, supervision, and quality assurance activities of the AET chair. Students and researchers can upload PDF documents for automated analysis by AI models. Results are returned as structured, non-binding feedback. Use of the application is voluntary.
      </p>
      <p>
        Uploaded content and review results are not used for independent research purposes within the scope of this privacy policy. Should future use for research purposes be planned, this will only take place on the basis of separate information and, where necessary, separate consent.
      </p>
      <h3>3.2 Legal Basis</h3>
      <p>Unless stated otherwise, the legal basis for processing is:</p>
      <ul>
        <li>
          <strong>Art.&nbsp;6(1)(e) GDPR in conjunction with Art.&nbsp;4(1) BayDSG</strong> (performance of a task in the public interest): Processing is necessary to fulfil the university&apos;s teaching tasks. The relevant task norm is in particular Art.&nbsp;2 of the{" "}
          <a href="https://www.gesetze-bayern.de/Content/Document/BayHIG-2" target="_blank" rel="noopener noreferrer">Bavarian Higher Education Innovation Act (BayHIG)</a>; supplemented by Art.&nbsp;3(1) BayHIG. Use of the Proposal Checker is voluntary and does not replace supervision, assessment, or any examination performance. TUM&apos;s examination and study regulations, in particular the{" "}
          <a href="https://www.tum.de/studium/im-studium/das-studium-organisieren/satzungen-ordnungen" target="_blank" rel="noopener noreferrer">General Academic and Examination Regulations (APSO)</a>{" "}
          and the respective subject-specific examination and study regulations (FPSO), remain unaffected by this for theses.
        </li>
        <li>
          <strong>Art.&nbsp;6(1)(a) GDPR</strong> (consent): The specific AI analysis of the uploaded document, including the transmission of the content required for that purpose to the selected AI provider, takes place only after active consent has been given by ticking the consent checkbox before starting the analysis. Without this consent, no analysis can be started. Consent may be withdrawn at any time with effect for the future; the lawfulness of processing carried out prior to withdrawal remains unaffected. Following withdrawal, no further AI analyses will be carried out on the basis of this consent.
        </li>
        <li>
          <strong>Art.&nbsp;6(1)(c) GDPR</strong> (compliance with a legal obligation): Transmissions to the data protection supervisory authority, to audit authorities, and to the Bavarian State Office for Information Security (LSI) are based on statutory information, disclosure, cooperation, notification, and assistance obligations. Specifying provisions are in particular Art.&nbsp;31 and Art.&nbsp;58(1) GDPR and Art.&nbsp;16(1) BayDSG (data protection supervisory authority), Art.&nbsp;111(1) in conjunction with Art.&nbsp;89 to 99, in particular Art.&nbsp;95 BayHO (audit), as well as Art.&nbsp;43(3) sentence 1 and (4) BayDiG in conjunction with Art.&nbsp;42(1) Nos.&nbsp;1, 2, 4 and 5 BayDiG (LSI).
        </li>
      </ul>

      <h3>3.3 Voluntary Nature of Provision</h3>
      <p>Provision of the data is neither legally nor contractually required. You are not obliged to provide the data. The only consequence of non-provision is that the AI-assisted analysis cannot be offered; no disadvantage in your studies or supervision will arise from this.</p>

      <h2>4. Data Collected and Processing Purposes</h2>
      <h3>4.1 Authentication Data</h3>
      <p>Upon login via TUM&apos;s central identity provider (Keycloak OIDC Single Sign-On), the following data is collected and stored in the application&apos;s user table:</p>
      <ul>
        <li>TUM identifier (user ID)</li>
        <li>First and last name</li>
        <li>Email address</li>
        <li>Role membership (e.g., student, PhD candidate, administrator) — derived from the Keycloak access token</li>
      </ul>
      <p><strong>Purpose:</strong> Access control, assignment of reviews to users, role-based permissions (e.g., access to AI providers, viewing assigned reviews).</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e) GDPR in conjunction with Art.&nbsp;4(1) BayDSG. Authentication is technically required to manage platform access and ensure the integrity of teaching operations.</p>
      <p><strong>Retention period:</strong> User data is stored for the duration of active platform use. Upon de-enrollment or upon request, data is deleted unless statutory retention periods apply.</p>

      <h3>4.2 Uploaded Documents</h3>
      <p>Users upload PDF documents (thesis proposals or complete theses). These are stored on persistent storage within TUM&apos;s Kubernetes cluster.</p>
      <p><strong>Purpose:</strong> Content analysis by AI models to generate feedback. Storage also enables re-analysis (retry) or submission of subsequent versions.</p>
      <p><strong>Note:</strong> Uploaded documents may contain personal data (e.g., author names, student ID numbers). Users are asked to include only content necessary for the review in their documents. Before uploading, users should check whether the document contains personal data of third parties, special categories of personal data within the meaning of Art.&nbsp;9 GDPR, confidential business information, or non-anonymised research, interview, or survey data. Such content should be removed or anonymised prior to upload, where it is not required for the analysis or where there is no authorisation for its processing.</p>
      <p><strong>Retention period:</strong> Until deletion by the user (self-service deletion in the application) or by an administrator.</p>

      <h3>4.3 AI Analysis and Image Processing</h3>
      <p>The analysis involves the following processing steps:</p>
      <ul>
        <li><strong>Text extraction:</strong> The text content of PDF pages is extracted automatically.</li>
        <li><strong>Page rendering:</strong> PDF pages are rendered server-side as PNG images (via Poppler/pdftoppm) to enable visual analysis by the AI model (e.g., figures, page layout, structure).</li>
        <li><strong>AI processing:</strong> Both the extracted text and rendered page images are sent to the selected AI model (Azure OpenAI or a self-hosted open-source model on TUM infrastructure). Analysis is performed in 7 parallel check groups (e.g., structure, problem statement, bibliography, figures, writing style, AI transparency, schedule), followed by a merging step.</li>
      </ul>
      <p><strong>Legal basis:</strong> The legal basis for the specific AI analysis, including the transmission of the content required for that purpose to the selected AI provider, is Art.&nbsp;6(1)(a) GDPR. Consent is given before each analysis by actively ticking the corresponding checkbox.</p>
      <p>Rendered PNG images are generated exclusively temporarily in server memory or temporary file system and are deleted upon completion of the analysis.</p>

      <h3>4.4 Review Data</h3>
      <p>For each review, the following data is stored in the database:</p>
      <ul>
        <li>Assignment to the submitting user (user ID, email, name)</li>
        <li>Submission and completion timestamps</li>
        <li>Selected AI provider and review mode (Proposal/Thesis)</li>
        <li>AI analysis results (feedback items, assessments)</li>
        <li>Annotations (e.g., marking individual findings as resolved, rejected, or confirmed)</li>
        <li>Comments and discussion threads on individual findings</li>
        <li>Optional assignment to supervisor and student (supervisor-student relationship)</li>
        <li>Share links (token, expiration date, optional password hash)</li>
        <li>Content hash (SHA-256) for duplicate detection</li>
      </ul>
      <p><strong>Purpose:</strong> Traceability, retrieval of past reviews, supervision support, version history.</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e), (3) GDPR in conjunction with Art.&nbsp;4(1) BayDSG and the higher-education task norms referenced in Section&nbsp;3.2. Where review data is generated directly as part of the specific AI analysis, that generation is additionally based on the consent given before the analysis is started.</p>
      <p><strong>Retention period:</strong> Until deletion by the user or an administrator.</p>

      <h3>4.5 Session Data</h3>
      <p>During active use, temporary session data is held in server memory. This includes analysis progress (Server-Sent Events) and is automatically deleted after at most one hour.</p>

      <h3>4.6 Audit Logging</h3>
      <p>For traceability and security, certain user actions are recorded in an audit log. The following data is captured:</p>
      <ul>
        <li>User ID, email address, and name of the acting person</li>
        <li>Type of action (e.g., review created, deleted, shared, annotation changed, comment added)</li>
        <li>Timestamp of the action</li>
        <li>Additional contextual details (e.g., selected provider, file name)</li>
      </ul>
      <p><strong>Purpose:</strong> Traceability of changes, abuse detection, support for error analysis.</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e), (3) GDPR in conjunction with Art.&nbsp;4(1) BayDSG; for the inspection and maintenance of automated data processing procedures and for ensuring network and information security additionally Art.&nbsp;6(1) BayDSG. Security measures are implemented in accordance with Art.&nbsp;32 GDPR.</p>
      <p><strong>Retention period:</strong> Audit log entries are stored for the lifetime of the associated review and automatically removed upon its deletion.</p>

      <h3>4.7 Rate Limiting</h3>
      <p>To protect against overload, user IDs and timestamps of review requests are kept in server memory within a sliding time window (default: 1 hour). No IP addresses are collected for this purpose.</p>
      <p><strong>Purpose:</strong> Protection of infrastructure against overload and abuse.</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e), (3) GDPR in conjunction with Art.&nbsp;4(1) BayDSG; for ensuring network and information security additionally Art.&nbsp;6(1) BayDSG.</p>
      <p><strong>Retention period:</strong> Data is automatically removed from memory after the time window expires (max. 1 hour).</p>

      <h3>4.8 Performance Metrics (Check Performance)</h3>
      <p>Technical performance metrics are recorded for each AI check group, in particular duration, token usage, and processing status. This data does not contain content of the uploaded document. However, because it is associated with the respective review ID, it can indirectly be attributed to a user.</p>
      <p><strong>Purpose:</strong> Quality assurance, error analysis, optimisation of AI analysis, and resource planning.</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e), (3) GDPR in conjunction with Art.&nbsp;4(1) BayDSG. To the extent that performance metrics are evaluated only in aggregated or anonymised form, no further processing of personal data takes place.</p>
      <p><strong>Retention period:</strong> Performance metrics are stored for the lifetime of the associated review and automatically removed upon its deletion.</p>

      <h3>4.9 Server and Access Logs</h3>
      <p>When the application is accessed, technically required server and access logs may be processed. These may include in particular the time of access, the requested resource, the HTTP status code, technical error information, the user agent, and the IP address.</p>
      <p><strong>Purpose:</strong> Ensuring technical operation, error analysis, abuse detection, and ensuring network and information security.</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e), (3) GDPR in conjunction with Art.&nbsp;4(1) BayDSG; for ensuring network and information security additionally Art.&nbsp;6(1) BayDSG.</p>
      <p><strong>Retention period:</strong> Server and access logs are stored only for as long as required for the purposes stated; the specific retention period is determined by the technical logging and operating concept.</p>

      <h2>5. Recipients and Data Processing</h2>
      <h3>5.1 Technical Operations</h3>
      <p>The application is operated on TUM&apos;s Kubernetes infrastructure, managed by the AET chair. The underlying infrastructure is provided by the{" "}<a href="https://www.cit.tum.de/ito/die-ito/" target="_blank" rel="noopener noreferrer">IT Organization (ITO)</a>{" "}of the Technical University of Munich.</p>
      <p>IT Organization (ITO)<br />Boltzmannstraße 3<br />85748 Garching bei München, Germany<br />Phone: +49-(0)89-289-18018<br />Email: ito(at)cit.tum.de</p>

      <h3>5.2 Azure OpenAI (Microsoft)</h3>
      <p>When &ldquo;Azure OpenAI&rdquo; is selected as the AI provider, the text content of uploaded documents required for the analysis and rendered page images (PNG) are transmitted to the Microsoft Azure OpenAI Service. The following applies:</p>
      <ul>
        <li>Microsoft acts as a data processor under an existing data processing agreement (DPA) between TUM and Microsoft pursuant to Art.&nbsp;28 GDPR; the legal basis for the transmission and AI processing is the consent given before the analysis is started, in accordance with Art.&nbsp;6(1)(a) GDPR.</li>
        <li>Processing generally takes place in the configured Azure EU region or Azure geography. The specific processing and any technical interim storage are governed by the Azure configuration in use, the deployment type, the Microsoft product terms, and the data protection terms agreed between TUM and Microsoft.</li>
        <li>Microsoft processes the transmitted content for the purpose of providing the service, as well as for content filtering and abuse detection. Under the Microsoft terms, customer data from Azure OpenAI is not used to improve or train foundation models without appropriate authorisation.</li>
        <li>Access by, or transfers to, Microsoft group companies in the United States cannot be entirely excluded. Where US recipients are certified under the EU-U.S. Data Privacy Framework, transfers are based on the adequacy decision (EU)&nbsp;2023/1795. For transfers not covered by the framework, Standard Contractual Clauses pursuant to Art.&nbsp;46(2)(c) GDPR are used. A copy of the safeguards may be requested from the controller named above.</li>
        <li>All data transmissions are encrypted (TLS).</li>
      </ul>

      <h3>5.3 Self-hosted local AI model (On-Premises)</h3>
      <p>When &ldquo;Local LLM&rdquo; is selected as the AI provider, all AI processing takes place on TUM&apos;s GPU infrastructure. No data is transmitted to third parties. Your data does not leave the university network.</p>

      <h3>5.4 Other Recipients</h3>
      <p>No personal data is disclosed to any other third parties.</p>
      <p>Where required, your data may be transmitted to the data protection supervisory authority and to audit authorities for the fulfilment of statutory information, disclosure, cooperation, or oversight obligations. The legal basis is Art.&nbsp;6(1)(c), (3) GDPR; for the data protection supervisory authority in particular Art.&nbsp;31 and Art.&nbsp;58(1) GDPR and Art.&nbsp;16(1) BayDSG; for audit purposes in particular Art.&nbsp;111(1) in conjunction with Art.&nbsp;89 to 99, in particular Art.&nbsp;95 BayHO; as data protection flanking provisions Art.&nbsp;5(1) sentence 1 No.&nbsp;1 and (4) BayDSG and Art.&nbsp;6(1) BayDSG.</p>
      <p>To counter threats to information technology security, data may be forwarded during electronic transmission to the Bavarian State Office for Information Security (LSI). The legal basis is Art.&nbsp;6(1)(c), (3) GDPR in conjunction with Art.&nbsp;43(3) sentence 1 and (4) of the Bavarian Digital Act (BayDiG) and Art.&nbsp;42(1) Nos.&nbsp;1, 2, 4 and 5 BayDiG; in the case of measures by the Office additionally Art.&nbsp;44(1) and (2) BayDiG.</p>

      <h2>6. Access Control and Data Visibility</h2>
      <p>Access to reviews is regulated as follows:</p>
      <ul>
        <li><strong>Students</strong> can only see their own reviews.</li>
        <li><strong>Supervisors (PhD candidates)</strong> can additionally view reviews of students assigned to them, to support supervision.</li>
        <li><strong>Specifically authorised administrators</strong> may access reviews to the extent necessary for operations, support, error analysis, security, permission management, or administrative tasks.</li>
      </ul>
      <p>Additionally, users can share individual reviews with third parties via time-limited, optionally password-protected share links. The responsibility for sharing such links lies with the user.</p>
      <p>The groups of persons who may obtain access to a review &mdash; in particular the submitting user, assigned supervisors, and specifically authorised administrators &mdash; are identified in this privacy policy and can therefore be reviewed by users before starting an analysis.</p>

      <h2>7. Retention Periods and Deletion</h2>
      <table>
        <thead><tr><th>Data Type</th><th>Retention Period</th></tr></thead>
        <tbody>
          <tr><td>User data (name, email, role)</td><td>Duration of active use; deletable upon request or upon determination that the eligibility for use has lapsed, unless statutory retention periods apply</td></tr>
          <tr><td>Authentication data (JWT session cookie)</td><td>Maximum 8 hours; deleted on logout or session expiry</td></tr>
          <tr><td>Session data (in-memory SSE)</td><td>Maximum 1 hour after last activity</td></tr>
          <tr><td>Rate limiting data (in-memory)</td><td>Maximum 1 hour (sliding window)</td></tr>
          <tr><td>Uploaded PDF documents</td><td>Until deletion by the user or an administrator</td></tr>
          <tr><td>Review results, annotations, comments, and discussions</td><td>Until deletion by the user or an administrator</td></tr>
          <tr><td>Performance metrics</td><td>Lifetime of the associated review</td></tr>
          <tr><td>Audit log entries</td><td>Lifetime of the associated review</td></tr>
          <tr><td>Rendered page images (PNG)</td><td>Temporary during analysis; deleted upon completion of the analysis</td></tr>
          <tr><td>localStorage data in browser</td><td>Until manual deletion by the user in their browser or via a corresponding function within the application</td></tr>
        </tbody>
      </table>
      <p>When the deletion function is used, reviews are no longer displayed in the application and are no longer included in regular database queries. Where technically a deletion marking (soft-delete) is initially applied, access to such data is restricted to specifically authorised administrators with a legitimate reason. Final deletion from the primary system takes place in accordance with the technical deletion concept; backup copies are overwritten or deleted as part of the regular backup cycles.</p>

      <h2>8. Cookies and Local Storage</h2>
      <h3>8.1 Cookies</h3>
      <p>This application uses only <strong>strictly necessary cookies</strong>:</p>
      <ul>
        <li><strong>Session cookie (session token):</strong> Contains a JWT token for authentication. Valid for a maximum of 8 hours or until logout. Required for the application to function.</li>
      </ul>
      <p><strong>No</strong> analytics, tracking, or advertising cookies are used. <strong>No</strong> third-party scripts are included.</p>
      <p><strong>Legal basis:</strong> Art.&nbsp;6(1)(e) GDPR in conjunction with Art.&nbsp;4(1) BayDSG. Technically necessary cookies are required for providing the service and do not require consent pursuant to &sect;&nbsp;25(2)(2) TDDDG.</p>

      <h3>8.2 Local Storage (localStorage)</h3>
      <p>Usage settings are stored locally in the browser so that they can be restored on a return visit. These may include in particular:</p>
      <ul>
        <li><strong>Provider preference:</strong> The last selected AI provider (Azure / Local LLM).</li>
        <li><strong>Review mode:</strong> The selected analysis type (Proposal/Thesis).</li>
        <li><strong>Selected check groups:</strong> The last selected combination of check categories.</li>
        <li><strong>Onboarding status:</strong> Whether the introductory tour has been completed.</li>
      </ul>
      <p>Local storage takes place in the user&apos;s browser. The stored values are not automatically transmitted to the server upon a mere visit to the application. If the user starts an analysis, the currently selected settings are transmitted to the server as part of the analysis request and stored with the review. Locally stored data can be deleted at any time via the browser settings.</p>
      <p><strong>Legal basis:</strong> The legal basis for the storage of technically required information in end-user devices is &sect;&nbsp;25(2)(2) TDDDG.</p>

      <h2>9. Data Transfers to Third Countries</h2>
      <p>Primary processing via Azure OpenAI takes place in a Microsoft EU region. To the extent that transfers to Microsoft group entities in the United States may occur, these are based on the adequacy decision under the EU-U.S. Data Privacy Framework (Implementing Decision (EU)&nbsp;2023/1795) and, on a supplementary basis, on Standard Contractual Clauses pursuant to Art.&nbsp;46 GDPR.</p>
      <p>When the self-hosted local model is selected, data remains within TUM&apos;s network.</p>

      <h2>10. Automated Decision-Making</h2>
      <p>The AI-assisted analysis does not constitute automated decision-making within the meaning of Art.&nbsp;22 GDPR. The analysis results are purely informational and serve exclusively as non-binding support for users.</p>
      <p>The AI feedback is not part of any formal assessment, examination decision, or supervisory decision. Teaching staff and supervisors must not base decisions exclusively or to a decisive extent on the AI feedback (cf. CJEU, judgment of 07.12.2023, Case C-634/21). The final substantive assessment always rests with the responsible teaching staff or supervisors.</p>
      <p>No profile is created about the user. The analysis relates exclusively to the uploaded document and the content contained therein.</p>

      <h2>11. Your Rights</h2>
      <p>As a data subject, you have the following rights under the GDPR:</p>
      <ul>
        <li><strong>Right of access (Art.&nbsp;15 GDPR):</strong> You have the right to obtain information about the personal data stored about you.</li>
        <li><strong>Right to rectification (Art.&nbsp;16 GDPR):</strong> If incorrect personal data is being processed, you have the right to rectification.</li>
        <li><strong>Right to erasure (Art.&nbsp;17 GDPR):</strong> If the legal requirements are met, you may request the deletion of your data. You can delete your reviews independently within the application (self-service deletion). For further deletion requests, please contact the responsible bodies listed above.</li>
        <li><strong>Right to restriction of processing (Art.&nbsp;18 GDPR):</strong> Under certain conditions, you may request the restriction of the processing of your data.</li>
        <li><strong>Right to data portability (Art.&nbsp;20 GDPR):</strong> If you have consented to the processing or a contract for data processing exists and the processing is carried out by automated means, you may have a right to data portability.</li>
        <li><strong>Right to object (Art.&nbsp;21 GDPR):</strong> You have the right to object at any time to the processing of your data for reasons arising from your particular situation, where processing is based on Art.&nbsp;6(1)(e) GDPR.</li>
        <li><strong>Right to withdraw consent (Art.&nbsp;7(3) GDPR):</strong> If you have given consent to processing, you may withdraw it at any time with effect for the future. The lawfulness of processing carried out prior to withdrawal remains unaffected.</li>
      </ul>
      <p>To exercise your rights, please contact the responsible department listed above or TUM&apos;s Data Protection Officer.</p>

      <h2>12. Right to Lodge a Complaint with a Supervisory Authority</h2>
      <p>Pursuant to Art.&nbsp;77 GDPR, you have the right to lodge a complaint with a data protection supervisory authority. The competent supervisory authority is:</p>
      <p>
        Bavarian State Commissioner for Data Protection (BayLfD)<br />
        Postal address: Postfach 22 12 19, 80502 Munich, Germany<br />
        Address: Wagmüllerstraße 18, 80538 Munich, Germany<br />
        Phone: +49-(0)89-212672-0<br />
        Email: poststelle(at)datenschutz-bayern.de<br />
        <a href="https://www.datenschutz-bayern.de" target="_blank" rel="noopener noreferrer">www.datenschutz-bayern.de</a>
      </p>

      <h2>13. Data Security</h2>
      <p>We take appropriate technical and organizational measures to protect your data:</p>
      <ul>
        <li>All communication with this application is exclusively via encrypted connections (HTTPS/TLS). TLS certificates are automatically obtained via{" "}<a href="https://letsencrypt.org/" target="_blank" rel="noopener noreferrer">Let&apos;s Encrypt</a>{" "}and regularly renewed.</li>
        <li>The infrastructure is operated within TUM&apos;s network on a Kubernetes cluster.</li>
        <li>Access to the database (PostgreSQL) and stored documents is restricted to the application and is not publicly accessible.</li>
        <li>Authentication is provided via TUM&apos;s established Keycloak SSO with JWT-based session management.</li>
        <li>Share links can be configured with an expiration date and optional password protection. Passwords are stored only as cryptographic hashes.</li>
        <li>When a review is deleted, it is no longer displayed in the application and no longer considered in regular database queries. Where technically a soft-delete marking is initially applied, access is restricted to specifically authorised administrators with a legitimate reason. Final deletion takes place in accordance with the technical deletion concept and the backup cycles.</li>
      </ul>

      <h2>14. Changes to This Privacy Policy</h2>
      <p>We reserve the right to update this privacy policy to reflect changes in the legal situation or changes to the application or data processing. The current version is always available within the application.</p>

      <h2>15. Further Information</h2>
      <p>For further information about the processing of your data and your rights, you may contact us using the contact details of the responsible department listed above.</p>
      <p><em>Last updated: 30 April 2026</em></p>
    </main>
  );
}

export function PrivacyContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [lang, setLang] = useState<Lang>("de");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                <h1 className="text-lg font-semibold text-white">
                  {lang === "de" ? "Datenschutzerklärung" : "Privacy Policy"}
                </h1>
                <p className="text-xs text-white/40">Proposal Checker</p>
              </div>
            </div>
          </div>
          <LanguageSwitcher lang={lang} setLang={setLang} />
        </header>

        <GdprActions isAuthenticated={isAuthenticated} lang={lang} />

        {lang === "de" ? <PrivacyDE /> : <PrivacyEN />}

        <Footer />
      </div>
    </div>
  );
}
