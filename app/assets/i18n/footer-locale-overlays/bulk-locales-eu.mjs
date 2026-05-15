/**
 * Hardcoded footer/legal overlays: FR, DE, ES, IT (merged at build if no per-lang .mjs).
 * Abbreviated legal text; same page keys as vi.mjs.
 */
import { readPrivacyHtml } from './privacy-fragments/read-privacy.mjs';
import { readTermsHtml } from './terms-fragments/read-terms.mjs';
import { readRefundHtml } from './refund-fragments/read-refund.mjs';
import { readAccessibilityHtml } from './accessibility-fragments/read-accessibility.mjs';
import { readCookieTopHtml, readCookiePrefsHtml } from './cookie-fragments/read-cookies.mjs';

export default {
    fr: {
        privacy: {
            metaDescription:
                'Politique de confidentialité C:\Totilove — collecte, utilisation et protection de vos données.',
            documentTitle: 'Politique de confidentialité — C:\Totilove',
            heroTitleHtml: 'Politique de confidentialité',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('fr'),
        },
        terms: {
            metaDescription: "Conditions d'utilisation C:\Totilove — règles d'utilisation de la plateforme.",
            documentTitle: "Conditions d'utilisation — C:\Totilove",
            heroTitleHtml: "Conditions d'utilisation",
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('fr'),
        },
        cookies: {
            metaDescription:
                'Politique cookies C:\Totilove — catégories, préférences et gestion sur cette page.',
            documentTitle: 'Cookies — C:\Totilove',
            heroTitleHtml: 'Cookies',
            heroSubtitle: 'Avril 2026.',
            cardTopHtml: readCookieTopHtml('fr'),
            cardPrefsHtml: readCookiePrefsHtml('fr'),
        },
        refund: {
            metaDescription:
                'Politique de remboursement C:\Totilove — abonnements, admissibilité et demandes de remboursement.',
            documentTitle: 'Politique de remboursement — C:\Totilove',
            heroTitleHtml: 'Politique de remboursement',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('fr'),
        },
        safety: {
            metaDescription:
                'Conseils de sécurité C:\Totilove — restez en sécurité lors de rencontres en ligne et en personne.',
            documentTitle: 'Conseils de sécurité — C:\Totilove',
            heroTitleHtml: 'Conseils de sécurité',
            heroSubtitle:
                'Votre sécurité est notre priorité absolue. Suivez ces recommandations pour rester en sécurité en ligne et lors de vos rencontres.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Retour à l'accueil</a>
<h2><i class="fas fa-lock"></i> Protégez vos informations personnelles</h2>
<p>Ne partagez jamais d'informations personnelles sensibles avec d'autres utilisateurs, surtout lors des premières conversations.</p>
<p>Cela inclut :</p>
<ul>
<li>Nom complet</li>
<li>Adresse personnelle</li>
<li>Coordonnées professionnelles</li>
<li>Informations financières</li>
<li>Pièces d'identité</li>
</ul>
<p>Utilisez le système de messagerie intégré à l'application jusqu'à ce que vous vous sentiez à l'aise et en confiance avec l'autre personne.</p>
<p><strong>Rappel :</strong> Pas d'adresse personnelle &bull; Pas de coordonnées bancaires &bull; Pas de pièces d'identité</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Vidéo avant la rencontre</h2>
<p>Avant une rencontre en personne, nous vous recommandons vivement de faire un appel vidéo d'abord.</p>
<p>Cela permet de :</p>
<ul>
<li>confirmer l'identité</li>
<li>établir la confiance</li>
<li>réduire les risques d'usurpation d'identité ou d'escroquerie</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Premières rencontres sécurisées</h2>
<p>Lors d'une première rencontre :</p>
<ul>
<li>Choisissez un lieu public et fréquenté (ex. café, restaurant, parc)</li>
<li>Informez un ami ou un membre de votre famille de vos projets (qui, où et quand)</li>
<li>Utilisez votre propre moyen de transport et évitez d'accepter des trajets d'inconnus</li>
<li>Gardez votre téléphone chargé et accessible à tout moment</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Reconnaître les signaux d'alarme</h2>
<p>Soyez prudent si vous remarquez :</p>
<ul>
<li>Demandes d'argent, de cadeaux ou d'aide financière (arnaques sentimentales)</li>
<li>Refus d'appel vidéo après des discussions prolongées</li>
<li>Histoires personnelles incohérentes ou irréalistes</li>
<li>Pression pour déplacer les conversations hors de la plateforme (ex. WhatsApp, Telegram)</li>
<li>Flatteries excessives ou attachement émotionnel rapide</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Signaler et bloquer</h2>
<p>Si quelque chose vous semble suspect ou dangereux, faites confiance à votre instinct.</p>
<p>Vous pouvez :</p>
<ul>
<li>Utiliser le bouton Signaler sur les profils ou les messages</li>
<li>Bloquer immédiatement un utilisateur depuis sa page de profil</li>
</ul>
<p>Tous les signalements sont examinés par notre équipe de modération aussi rapidement que raisonnablement possible.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Ressources d'urgence</h2>
<p>Si vous êtes en danger immédiat, contactez vos services d'urgence locaux.</p>
<p>Pour du soutien lié aux abus en ligne ou à l'utilisation abusive d'images, vous pouvez également consulter :</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'Contacter le support C:\Totilove.',
            documentTitle: 'Contact — C:\Totilove',
            heroTitleHtml: 'Contact',
            heroSubtitle:
                'Nous sommes là pour vous aider. Envoyez-nous un message et nous répondrons dans les 24 heures.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Retour à l'accueil</a>
<h2><i class="fas fa-life-ring"></i> Continuer vers l'assistance</h2>
<p>Les demandes d'assistance sont traitées dans l'espace membre.</p>
<p>Veuillez d'abord vous connecter, vous serez alors redirigé vers le centre d'assistance.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Connectez-vous pour continuer
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Délais de réponse</h2>
<p><strong>Demandes générales :</strong> sous 24 heures</p>
<p><strong>Signalements de sécurité et d'abus :</strong> sous 4 heures</p>
<p><strong>Problèmes de facturation :</strong> sous 12 heures</p>
<p>Pour des problèmes de sécurité urgents, veuillez utiliser le bouton <strong>Signaler</strong> directement sur le profil concerné.</p>`,
        },
        accessibility: {
            metaDescription:
                "Déclaration d'accessibilité C:\Totilove — engagement WCAG 2.1 AA, fonctionnalités prises en charge et contact.",
            documentTitle: 'Accessibilité — C:\Totilove',
            heroTitleHtml: 'Accessibilité',
            heroSubtitle:
                "C:\Totilove s'engage à rendre l'amour accessible à tous, quelles que soient leurs capacités.",
            cardInnerHtml: readAccessibilityHtml('fr'),
        },
        help: {
            metaDescription:
                "Centre d'aide C:\Totilove — réponses aux questions fréquentes et comment tirer le meilleur parti de la plateforme.",
            documentTitle: "Centre d'aide — C:\Totilove",
            heroTitleHtml: "Centre d'aide",
            heroSubtitle:
                'Trouvez des réponses aux questions fréquentes et tirez le meilleur parti de C:\Totilove.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Retour à l'accueil</a>
<h2><i class="fas fa-user-plus"></i> Premiers pas</h2>
<p>Créer un compte sur C:\Totilove est gratuit. Rendez-vous sur la <a href="/pages/register.html">page d'inscription</a> et remplissez vos informations. Une fois inscrit, complétez votre profil pour augmenter votre visibilité auprès des matchs.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Trouver des matchs</h2>
<p>Utilisez la fonction de <strong>recherche</strong> pour filtrer par âge, localisation, langue et centres d'intérêt. Notre moteur de matchmaking intelligent suggère également automatiquement des profils compatibles en fonction de vos préférences.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Messagerie</h2>
<p>Vous pouvez envoyer un message à tout profil avec lequel vous avez un match. Rendez-vous dans <strong>Messages</strong> dans la barre de navigation pour voir toutes vos conversations. Tous les messages sont chiffrés et privés.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Paramètres du compte</h2>
<p>Gérez vos préférences de notification, vos paramètres de confidentialité et votre langue dans <strong>Réglages</strong>. Vous pouvez désactiver ou supprimer votre compte à tout moment depuis la section Compte.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Facturation et abonnements</h2>
<p>C:\Totilove propose une version gratuite ainsi que des formules premium. Consultez et gérez votre abonnement dans <strong>Facturation</strong> depuis le menu de votre compte. Annulez à tout moment — aucun frais caché.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> Besoin d'aide ?</h2>
<p>Vous n'avez pas trouvé votre réponse ici ? <a href="/pages/footer/contact.html">Contactez notre équipe d'assistance</a> et nous vous répondrons dans les 24 heures.</p>`,
        },
        sitemap: {
            metaDescription: 'Plan du site C:\Totilove.',
            documentTitle: 'Plan du site — C:\Totilove',
            heroTitleHtml: 'Plan du site',
            heroSubtitle: 'Vue d’ensemble des pages.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Retour à l'accueil</a>
<h2><i class="fas fa-globe"></i> Pages</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>Principal</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Accueil</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Inscription</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Connexion</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Recherche</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Matchs</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Messages</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Profil</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Mon profil</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> Modifier</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Photos</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Statistiques</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Activité</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Compte</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Paramètres</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Facturation</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> En ligne</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Aide</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Aide</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> Sécurité</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Contact</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Légal</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Confidentialité</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> CGU</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Remboursement</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Autre</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Accessibilité</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookies</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Plan du site</a></li>
</ul></div>
</div>`,
        },
    },
    de: {
        privacy: {
            metaDescription:
                'C:\Totilove Datenschutzerklärung — wie wir Daten erheben, nutzen und schützen.',
            documentTitle: 'Datenschutzerklärung — C:\Totilove',
            heroTitleHtml: 'Datenschutzerklärung',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('de'),
        },
        terms: {
            metaDescription:
                'C:\Totilove Nutzungsbedingungen — Regeln und Bedingungen für die Nutzung der Plattform.',
            documentTitle: 'Nutzungsbedingungen — C:\Totilove',
            heroTitleHtml: 'Nutzungsbedingungen',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('de'),
        },
        cookies: {
            metaDescription:
                'C:\Totilove Cookie-Richtlinie — Kategorien, Einwilligung und Verwaltung auf dieser Seite.',
            documentTitle: 'Cookie — C:\Totilove',
            heroTitleHtml: 'Cookie',
            heroSubtitle: 'April 2026.',
            cardTopHtml: readCookieTopHtml('de'),
            cardPrefsHtml: readCookiePrefsHtml('de'),
        },
        refund: {
            metaDescription:
                'C:\Totilove Rückerstattungsrichtlinie — Abonnements, Berechtigung und Beantragung von Rückerstattungen.',
            documentTitle: 'Rückerstattungsrichtlinie — C:\Totilove',
            heroTitleHtml: 'Rückerstattungsrichtlinie',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('de'),
        },
        safety: {
            metaDescription:
                'C:\Totilove Sicherheitshinweise — bleiben Sie beim Online-Dating und bei Treffen sicher.',
            documentTitle: 'Sicherheitshinweise — C:\Totilove',
            heroTitleHtml: 'Sicherheitshinweise',
            heroSubtitle:
                'Ihre Sicherheit hat für uns oberste Priorität. Befolgen Sie diese Hinweise für Online-Gespräche und persönliche Treffen.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Zur Startseite</a>
<h2><i class="fas fa-lock"></i> Schützen Sie Ihre persönlichen Daten</h2>
<p>Geben Sie niemals sensible persönliche Informationen an andere Benutzer weiter, insbesondere nicht in frühen Gesprächen.</p>
<p>Dazu gehören:</p>
<ul>
<li>Vollständiger Name</li>
<li>Wohnadresse</li>
<li>Arbeitsplatzdetails</li>
<li>Finanzinformationen</li>
<li>Ausweisdokumente</li>
</ul>
<p>Nutzen Sie das integrierte Nachrichtensystem der App, bis Sie sich wohlfühlen und der anderen Person vertrauen.</p>
<p><strong>Erinnerung:</strong> Keine Wohnadresse &bull; Keine Bankdaten &bull; Keine Ausweisdokumente</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Videoanruf vor dem Treffen</h2>
<p>Bevor Sie sich persönlich treffen, empfehlen wir dringend, zuerst einen Videoanruf zu führen.</p>
<p>Dies hilft:</p>
<ul>
<li>Identität zu bestätigen</li>
<li>Vertrauen aufzubauen</li>
<li>Risiko von Identitätsbetrug oder Betrug zu verringern</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Sichere erste Treffen</h2>
<p>Beim ersten Treffen mit jemandem:</p>
<ul>
<li>Treffen Sie sich an einem öffentlichen, belebten Ort (z. B. Café, Restaurant, Park)</li>
<li>Informieren Sie einen Freund oder ein Familienmitglied über Ihre Pläne (wen, wo und wann)</li>
<li>Nutzen Sie eigene Transportmittel und nehmen Sie keine Fahrten von Fremden an</li>
<li>Halten Sie Ihr Telefon jederzeit geladen und erreichbar</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Erkennen Sie Warnsignale</h2>
<p>Seien Sie vorsichtig, wenn Ihnen auffällt:</p>
<ul>
<li>Bitten um Geld, Geschenke oder finanzielle Unterstützung (Romance-Betrug)</li>
<li>Verweigerung von Videoanrufen nach längerem Chatten</li>
<li>Widersprüchliche oder unrealistische persönliche Geschichten</li>
<li>Druck, Gespräche außerhalb der Plattform zu verlagern (z. B. WhatsApp, Telegram)</li>
<li>Übermäßige Schmeicheleien oder schnelle emotionale Bindung</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Melden &amp; Blockieren</h2>
<p>Wenn sich etwas verdächtig oder unsicher anfühlt, vertrauen Sie Ihrem Instinkt.</p>
<p>Sie können:</p>
<ul>
<li>Die Melde-Schaltfläche auf Profilen oder Nachrichten verwenden</li>
<li>Benutzer sofort über ihre Profilseite blockieren</li>
</ul>
<p>Alle Meldungen werden von unserem Moderationsteam so schnell wie vernünftigerweise möglich überprüft.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Notfallressourcen</h2>
<p>Wenn Sie sich in unmittelbarer Gefahr befinden, kontaktieren Sie Ihren örtlichen Notdienst.</p>
<p>Für Unterstützung im Zusammenhang mit Online-Missbrauch oder Missbrauch von Bildern können Sie sich auch an folgende Stellen wenden:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'C:\Totilove Support kontaktieren.',
            documentTitle: 'Kontakt — C:\Totilove',
            heroTitleHtml: 'Kontakt',
            heroSubtitle:
                'Wir sind für Sie da. Schreiben Sie uns — in der Regel antworten wir innerhalb von 24 Stunden.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Zurück zur Startseite</a>
<h2><i class="fas fa-life-ring"></i> Weiter zum Support</h2>
<p>Supportanfragen werden im Mitgliederbereich bearbeitet.</p>
<p>Bitte melden Sie sich zuerst an, dann werden Sie zum Support-Center weitergeleitet.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Anmelden, um fortzufahren
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Antwortzeiten</h2>
<p><strong>Allgemeine Anfragen:</strong> innerhalb von 24 Stunden</p>
<p><strong>Sicherheits- und Missbrauchsmeldungen:</strong> innerhalb von 4 Stunden</p>
<p><strong>Abrechnungsprobleme:</strong> innerhalb von 12 Stunden</p>
<p>Bei dringenden Sicherheitsbedenken nutzen Sie bitte direkt die <strong>Melden</strong>-Schaltfläche auf dem entsprechenden Profil.</p>`,
        },
        accessibility: {
            metaDescription:
                'Barrierefreiheitserklärung C:\Totilove — WCAG 2.1 AA, unterstützte Funktionen und Kontakt.',
            documentTitle: 'Barrierefreiheit — C:\Totilove',
            heroTitleHtml: 'Barrierefreiheit',
            heroSubtitle:
                'C:\Totilove ist bestrebt, Liebe für alle zugänglich zu machen, unabhängig von ihren Fähigkeiten.',
            cardInnerHtml: readAccessibilityHtml('de'),
        },
        help: {
            metaDescription:
                'C:\Totilove Hilfezentrum — Antworten auf häufig gestellte Fragen und wie Sie die Plattform optimal nutzen.',
            documentTitle: 'Hilfezentrum — C:\Totilove',
            heroTitleHtml: 'Hilfezentrum',
            heroSubtitle:
                'Hier finden Sie Antworten auf häufig gestellte Fragen und erfahren, wie Sie C:\Totilove optimal nutzen können.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Zurück zur Startseite</a>
<h2><i class="fas fa-user-plus"></i> Erste Schritte</h2>
<p>Die Erstellung eines Kontos bei C:\Totilove ist kostenlos. Besuchen Sie die <a href="/pages/register.html">Registrierungsseite</a> und geben Sie Ihre Daten ein. Nach der Registrierung vervollständigen Sie Ihr Profil, um Ihre Sichtbarkeit bei Matches zu erhöhen.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Matches finden</h2>
<p>Nutzen Sie die <strong>Suchfunktion</strong>, um nach Alter, Standort, Sprache und Interessen zu filtern. Unsere intelligente Matchmaking-Engine schlägt Ihnen automatisch kompatible Profile basierend auf Ihren Präferenzen vor.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Nachrichten</h2>
<p>Sie können jedem Profil, mit dem Sie ein Match haben, eine Nachricht senden. Gehen Sie zu <strong>Nachrichten</strong> in der Navigationsleiste, um alle Unterhaltungen zu sehen. Alle Nachrichten sind verschlüsselt und privat.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Kontoeinstellungen</h2>
<p>Verwalten Sie Ihre Benachrichtigungseinstellungen, Datenschutzeinstellungen und Sprache in den <strong>Einstellungen</strong>. Sie können Ihr Konto jederzeit im Bereich Konto deaktivieren oder löschen.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Abrechnung &amp; Abonnements</h2>
<p>C:\Totilove bietet eine kostenlose Version sowie Premium-Tarife an. Sehen Sie Ihr Abonnement ein und verwalten Sie es unter <strong>Abrechnung</strong> in Ihrem Kontomenü. Jederzeit kündbar — keine versteckten Gebühren.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> Brauchen Sie noch Hilfe?</h2>
<p>Finden Sie hier keine Antwort? <a href="/pages/footer/contact.html">Kontaktieren Sie unser Support-Team</a>, und wir melden uns innerhalb von 24 Stunden bei Ihnen.</p>`,
        },
        sitemap: {
            metaDescription: 'C:\Totilove Sitemap.',
            documentTitle: 'Sitemap — C:\Totilove',
            heroTitleHtml: 'Sitemap',
            heroSubtitle: 'Übersicht der Seiten.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Zur Startseite</a>
<h2><i class="fas fa-globe"></i> Seiten</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>Haupt</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Start</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Registrieren</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Login</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Suche</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Matches</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Nachrichten</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Profil</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Profil</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> Bearbeiten</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Fotos</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Statistik</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Aktivität</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Konto</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Einstellungen</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Abrechnung</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> Online</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Hilfe</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Hilfe</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> Sicherheit</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Kontakt</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Rechtliches</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Datenschutz</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> AGB</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Rückerstattung</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Mehr</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Barrierefreiheit</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookies</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Sitemap</a></li>
</ul></div>
</div>`,
        },
    },
    es: {
        privacy: {
            metaDescription:
                'Política de privacidad C:\Totilove — cómo recopilamos, usamos y protegemos sus datos.',
            documentTitle: 'Política de Privacidad — C:\Totilove',
            heroTitleHtml: 'Política de Privacidad',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('es'),
        },
        terms: {
            metaDescription:
                'Términos de Servicio C:\Totilove — reglas y condiciones para el uso de la plataforma.',
            documentTitle: 'Términos de Servicio — C:\Totilove',
            heroTitleHtml: 'Términos de Servicio',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('es'),
        },
        cookies: {
            metaDescription:
                'Política de cookies C:\Totilove — categorías, consentimiento y gestión en esta página.',
            documentTitle: 'Cookie — C:\Totilove',
            heroTitleHtml: 'Cookie',
            heroSubtitle: 'Abril 2026.',
            cardTopHtml: readCookieTopHtml('es'),
            cardPrefsHtml: readCookiePrefsHtml('es'),
        },
        refund: {
            metaDescription:
                'Política de Reembolsos C:\Totilove — suscripciones, elegibilidad y cómo solicitar un reembolso.',
            documentTitle: 'Política de Reembolsos — C:\Totilove',
            heroTitleHtml: 'Política de Reembolsos',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('es'),
        },
        safety: {
            metaDescription: 'Consejos de seguridad C:\Totilove — mantente seguro en las citas en línea.',
            documentTitle: 'Consejos de seguridad — C:\Totilove',
            heroTitleHtml: 'Consejos de seguridad',
            heroSubtitle:
                'Tu seguridad es nuestra máxima prioridad. Sigue estas pautas para mantenerte a salvo al interactuar en línea y al conocerte en persona.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Inicio</a>
<h2><i class="fas fa-lock"></i> Protege tu información personal</h2>
<p>Nunca compartas información personal sensible con otros usuarios, especialmente en conversaciones tempranas.</p>
<p>Esto incluye:</p>
<ul>
<li>Nombre completo</li>
<li>Dirección de casa</li>
<li>Detalles del lugar de trabajo</li>
<li>Información financiera</li>
<li>Documentos de identidad</li>
</ul>
<p>Utiliza el sistema de mensajería de la aplicación hasta que te sientas cómodo y confíes en la otra persona.</p>
<p><strong>Recordatorio:</strong> Sin dirección de casa &bull; Sin datos bancarios &bull; Sin documentos de identidad</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Videollamada antes de conocerse</h2>
<p>Antes de conocer a alguien en persona, te recomendamos encarecidamente hacer primero una videollamada.</p>
<p>Esto ayuda a:</p>
<ul>
<li>confirmar la identidad</li>
<li>generar confianza</li>
<li>reducir el riesgo de suplantación de identidad o estafas</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Primeros encuentros seguros</h2>
<p>Al conocer a alguien por primera vez:</p>
<ul>
<li>Reúnanse en un lugar público y concurrido (ej. café, restaurante, parque)</li>
<li>Cuéntale a un amigo o familiar tus planes (quién, dónde y cuándo)</li>
<li>Usa tu propio transporte y evita aceptar viajes de desconocidos</li>
<li>Mantén tu teléfono cargado y accesible en todo momento</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Reconoce las señales de alerta</h2>
<p>Ten cuidado si notas:</p>
<ul>
<li>Solicitudes de dinero, regalos o ayuda financiera (estafas románticas)</li>
<li>Negativa a hacer videollamada después de mucho tiempo conversando</li>
<li>Historias personales inconsistentes o irreales</li>
<li>Presión para mover las conversaciones fuera de la plataforma (ej. WhatsApp, Telegram)</li>
<li>Halagos excesivos o apego emocional rápido</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Reporta y bloquea</h2>
<p>Si algo te parece sospechoso o inseguro, confía en tu instinto.</p>
<p>Puedes:</p>
<ul>
<li>Usar el botón de Reportar en perfiles o mensajes</li>
<li>Bloquear usuarios al instante desde su página de perfil</li>
</ul>
<p>Todos los reportes son revisados por nuestro equipo de moderación tan rápido como sea razonablemente posible.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Recursos de emergencia</h2>
<p>Si estás en peligro inmediato, contacta a tus servicios de emergencia locales.</p>
<p>Para apoyo relacionado con abuso en línea o mal uso de imágenes, también puedes consultar:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'Contacto con soporte C:\Totilove.',
            documentTitle: 'Contacto — C:\Totilove',
            heroTitleHtml: 'Contacto',
            heroSubtitle:
                'Estamos aquí para ayudarte. Envíanos un mensaje y responderemos en un plazo de 24 horas.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Volver al inicio</a>
<h2><i class="fas fa-life-ring"></i> Continuar al soporte</h2>
<p>Las solicitudes de soporte se gestionan dentro del área de miembros.</p>
<p>Inicie sesión primero y será redirigido al Centro de Soporte.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Iniciar sesión para continuar
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Tiempos de respuesta</h2>
<p><strong>Consultas generales:</strong> dentro de 24 horas</p>
<p><strong>Informes de seguridad y abuso:</strong> dentro de 4 horas</p>
<p><strong>Problemas de facturación:</strong> dentro de 12 horas</p>
<p>Para problemas de seguridad urgentes, utilice el botón de <strong>Reportar</strong> directamente en el perfil correspondiente.</p>`,
        },
        accessibility: {
            metaDescription:
                'Declaración de accesibilidad C:\Totilove — WCAG 2.1 AA, funciones y cómo solicitar asistencia.',
            documentTitle: 'Accesibilidad — C:\Totilove',
            heroTitleHtml: 'Accesibilidad',
            heroSubtitle:
                'C:\Totilove está comprometido a hacer que el amor sea accesible para todos, independientemente de sus capacidades.',
            cardInnerHtml: readAccessibilityHtml('es'),
        },
        help: {
            metaDescription:
                'Centro de ayuda C:\Totilove — respuestas a preguntas frecuentes y cómo sacar el máximo provecho de la plataforma.',
            documentTitle: 'Centro de ayuda — C:\Totilove',
            heroTitleHtml: 'Centro de Ayuda',
            heroSubtitle:
                'Encuentra respuestas a preguntas frecuentes y saca el máximo provecho de C:\Totilove.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Volver al inicio</a>
<h2><i class="fas fa-user-plus"></i> Primeros pasos</h2>
<p>Crear una cuenta en C:\Totilove es gratuito. Visita la <a href="/pages/register.html">página de Registro</a> y completa tus datos. Una vez registrado, completa tu perfil para aumentar tu visibilidad entre los matches.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Cómo encontrar matches (coincidencias)</h2>
<p>Utiliza la función de <strong>Búsqueda</strong> para filtrar por edad, ubicación, idioma e intereses. Nuestro motor de emparejamiento inteligente también sugiere perfiles compatibles automáticamente según tus preferencias.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Mensajería</h2>
<p>Puedes enviar un mensaje a cualquier perfil con el que hagas match. Ve a <strong>Mensajes</strong> en la barra de navegación para ver todas las conversaciones. Todos los mensajes están cifrados y son privados.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Configuración de la cuenta</h2>
<p>Administra tus preferencias de notificaciones, configuraciones de privacidad e idioma en <strong>Ajustes</strong>. Puedes desactivar o eliminar tu cuenta en cualquier momento desde la sección Cuenta.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Facturación y suscripciones</h2>
<p>C:\Totilove ofrece un nivel gratuito, así como planes premium. Revisa y administra tu suscripción en <strong>Facturación</strong> dentro del menú de tu cuenta. Cancela cuando quieras, sin cargos ocultos.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> ¿Aún necesitas ayuda?</h2>
<p>¿No encuentras tu respuesta aquí? <a href="/pages/footer/contact.html">Contacta a nuestro equipo de soporte</a> y te responderemos en un plazo de 24 horas.</p>`,
        },
        sitemap: {
            metaDescription: 'Mapa del sitio C:\Totilove.',
            documentTitle: 'Mapa — C:\Totilove',
            heroTitleHtml: 'Mapa del sitio',
            heroSubtitle: 'Páginas principales.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Inicio</a>
<h2><i class="fas fa-globe"></i> Mapa</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>Principal</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Inicio</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Registro</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Entrar</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Buscar</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Matches</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Mensajes</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Perfil</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Mi perfil</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> Editar</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Fotos</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Estadísticas</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Actividad</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Cuenta</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Ajustes</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Facturación</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> En línea</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Ayuda</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Ayuda</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> Seguridad</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Contacto</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Legal</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Privacidad</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> Términos</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Reembolso</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Otro</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Accesibilidad</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookies</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Mapa</a></li>
</ul></div>
</div>`,
        },
    },
    it: {
        privacy: {
            metaDescription:
                'Informativa sulla privacy C:\Totilove — come raccogliamo, utilizziamo e proteggiamo i tuoi dati.',
            documentTitle: 'Informativa sulla privacy — C:\Totilove',
            heroTitleHtml: 'Informativa sulla privacy',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('it'),
        },
        terms: {
            metaDescription:
                'Termini di servizio C:\Totilove — regole e condizioni per l’uso della piattaforma.',
            documentTitle: 'Termini di servizio — C:\Totilove',
            heroTitleHtml: 'Termini di servizio',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('it'),
        },
        cookies: {
            metaDescription:
                'Informativa sui cookie C:\Totilove — categorie, consenso e gestione su questa pagina.',
            documentTitle: 'Cookie — C:\Totilove',
            heroTitleHtml: 'Cookie',
            heroSubtitle: 'Aprile 2026.',
            cardTopHtml: readCookieTopHtml('it'),
            cardPrefsHtml: readCookiePrefsHtml('it'),
        },
        refund: {
            metaDescription:
                'Politica di rimborso C:\Totilove — abbonamenti, idoneità e come richiedere un rimborso.',
            documentTitle: 'Politica di rimborso — C:\Totilove',
            heroTitleHtml: 'Politica di rimborso',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('it'),
        },
        safety: {
            metaDescription:
                'Suggerimenti di sicurezza C:\Totilove — proteggiti online e negli incontri di persona.',
            documentTitle: 'Suggerimenti di sicurezza — C:\Totilove',
            heroTitleHtml: 'Suggerimenti di sicurezza',
            heroSubtitle:
                'La tua sicurezza è la nostra massima priorità. Segui queste linee guida per interagire online e incontrare le persone in sicurezza.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Home</a>
<h2><i class="fas fa-lock"></i> Proteggi le tue informazioni personali</h2>
<p>Non condividere mai informazioni personali sensibili con altri utenti, soprattutto all'inizio delle conversazioni.</p>
<p>Questo include:</p>
<ul>
<li>Nome completo</li>
<li>Indirizzo di casa</li>
<li>Dettagli del luogo di lavoro</li>
<li>Informazioni finanziarie</li>
<li>Documenti di identità</li>
</ul>
<p>Usa il sistema di messaggistica integrato finché non ti senti a tuo agio e ti fidi dell'altra persona.</p>
<p><strong>Promemoria:</strong> Nessun indirizzo di casa &bull; Nessun dato bancario &bull; Nessun documento d'identità</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Videochiamata prima dell'incontro</h2>
<p>Prima di incontrarsi di persona, ti consigliamo vivamente di fare prima una videochiamata.</p>
<p>Questo aiuta a:</p>
<ul>
<li>confermare l'identità</li>
<li>costruire fiducia</li>
<li>ridurre il rischio di furto d'identità o truffe</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Primi incontri sicuri</h2>
<p>Quando incontri qualcuno per la prima volta:</p>
<ul>
<li>Incontratevi in un luogo pubblico e affollato (es. bar, ristorante, parco)</li>
<li>Racconta a un amico o familiare i tuoi piani (chi, dove e quando)</li>
<li>Organizza il tuo trasporto ed evita di accettare passaggi da sconosciuti</li>
<li>Tieni il telefono carico e sempre accessibile</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Riconosci i segnali d'allarme</h2>
<p>Fai attenzione se noti:</p>
<ul>
<li>Richieste di denaro, regali o assistenza finanziaria (truffe sentimentali)</li>
<li>Rifiuto di fare videochiamate dopo lunghe conversazioni</li>
<li>Storie personali incoerenti o irrealistiche</li>
<li>Pressione per spostare le conversazioni fuori dalla piattaforma (es. WhatsApp, Telegram)</li>
<li>Lusinghe eccessive o attaccamento emotivo rapido</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Segnala e blocca</h2>
<p>Se qualcosa ti sembra sospetto o pericoloso, fidati del tuo istinto.</p>
<p>Puoi:</p>
<ul>
<li>Usare il pulsante Segnala su profili o messaggi</li>
<li>Bloccare immediatamente gli utenti dalla loro pagina del profilo</li>
</ul>
<p>Tutte le segnalazioni vengono esaminate dal nostro team di moderazione il più rapidamente possibile.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Risorse di emergenza</h2>
<p>Se sei in pericolo immediato, contatta i servizi di emergenza locali.</p>
<p>Per supporto relativo ad abusi online o uso improprio di immagini, puoi anche consultare:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'Contatta il supporto C:\Totilove.',
            documentTitle: 'Contatti — C:\Totilove',
            heroTitleHtml: 'Contatti',
            heroSubtitle:
                'Siamo qui per aiutarti. Inviaci un messaggio e ti risponderemo entro 24 ore.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Torna alla home</a>
<h2><i class="fas fa-life-ring"></i> Continua al supporto</h2>
<p>Le richieste di supporto vengono gestite nell'area membri.</p>
<p>Effettua prima il login e verrai reindirizzato al Centro Assistenza.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Accedi per continuare
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Tempi di risposta</h2>
<p><strong>Richieste generali:</strong> entro 24 ore</p>
<p><strong>Segnalazioni di sicurezza e abusi:</strong> entro 4 ore</p>
<p><strong>Problemi di fatturazione:</strong> entro 12 ore</p>
<p>Per problemi di sicurezza urgenti, utilizza il pulsante <strong>Segnala</strong> direttamente sul profilo pertinente.</p>`,
        },
        accessibility: {
            metaDescription:
                'Dichiarazione di accessibilità C:\Totilove — WCAG 2.1 AA, funzionalità supportate e contatti.',
            documentTitle: 'Accessibilità — C:\Totilove',
            heroTitleHtml: 'Accessibilità',
            heroSubtitle:
                "C:\Totilove si impegna a rendere l'amore accessibile a tutti, indipendentemente dalle capacità.",
            cardInnerHtml: readAccessibilityHtml('it'),
        },
        help: {
            metaDescription:
                'Centro assistenza C:\Totilove — risposte alle domande frequenti e come sfruttare al meglio la piattaforma.',
            documentTitle: 'Centro assistenza — C:\Totilove',
            heroTitleHtml: 'Centro assistenza',
            heroSubtitle:
                'Trova le risposte alle domande frequenti e sfrutta al meglio C:\Totilove.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Torna alla home</a>
<h2><i class="fas fa-user-plus"></i> Primi passi</h2>
<p>Creare un account su C:\Totilove è gratuito. Visita la <a href="/pages/register.html">pagina Registrati</a> e inserisci i tuoi dati. Una volta registrato, completa il tuo profilo per aumentare la visibilità tra i match.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Trovare match</h2>
<p>Usa la funzione <strong>Cerca</strong> per filtrare per età, posizione, lingua e interessi. Il nostro motore di matchmaking intelligente suggerisce automaticamente profili compatibili in base alle tue preferenze.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Messaggistica</h2>
<p>Puoi inviare un messaggio a qualsiasi profilo con cui hai un match. Vai a <strong>Messaggi</strong> nella barra di navigazione per visualizzare tutte le conversazioni. Tutti i messaggi sono criptati e privati.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Impostazioni account</h2>
<p>Gestisci le preferenze delle notifiche, le impostazioni sulla privacy e la lingua in <strong>Impostazioni</strong>. Puoi disattivare o eliminare il tuo account in qualsiasi momento dalla sezione Account.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Fatturazione e abbonamenti</h2>
<p>C:\Totilove offre un livello gratuito e piani premium. Visualizza e gestisci il tuo abbonamento in <strong>Fatturazione</strong> dal menu del tuo account. Cancella quando vuoi — nessun costo nascosto.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> Hai ancora bisogno di aiuto?</h2>
<p>Non trovi la risposta che cerchi? <a href="/pages/footer/contact.html">Contatta il nostro team di supporto</a> e ti risponderemo entro 24 ore.</p>`,
        },
        sitemap: {
            metaDescription: 'Mappa del sito C:\Totilove.',
            documentTitle: 'Mappa — C:\Totilove',
            heroTitleHtml: 'Mappa del sito',
            heroSubtitle: 'Panoramica delle pagine.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Home</a>
<h2><i class="fas fa-globe"></i> Pagine</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>Principale</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Home</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Registrati</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Accedi</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Cerca</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Match</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Messaggi</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Profilo</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Profilo</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> Modifica</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Foto</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Statistiche</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Attività</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Account</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Impostazioni</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Fatturazione</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> Online</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Supporto</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Aiuto</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> Sicurezza</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Contatti</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Legale</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Privacy</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> Termini</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Rimborsi</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Altro</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Accessibilità</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookie</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Mappa</a></li>
</ul></div>
</div>`,
        },
    },
};
