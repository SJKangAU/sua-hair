// PrivacyPolicyPage.tsx
// Public privacy policy at /privacy. Plain-English draft structured around
// the Australian Privacy Principles (APPs) that apply to a small service
// business collecting customer contact details — notably APP 5 (notice of
// collection), APP 6 (use/disclosure), APP 8 (cross-border disclosure, since
// Firebase may store data outside Australia), APP 11 (security/retention),
// and APP 12/13 (access and correction).
//
// NOTE: This is a starting structure, not legal advice. It must be reviewed
// by a qualified Australian privacy practitioner before commercial reliance.
// Placeholders: the privacy contact address (privacy@suahair.com.au).

import LegalPage from "../components/legal/LegalPage";

// Keep this in sync with any substantive content change below.
const LAST_UPDATED = "23 October 2026";
const PRIVACY_EMAIL = "privacy@suahair.com.au";

const PrivacyPolicyPage = () => {
  return (
    <LegalPage title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This policy explains how Sua Hair Studio ("we", "us") handles the
        personal information you give us when you book an appointment. We've
        written it in plain language. If anything is unclear, please contact
        us using the details at the bottom.
      </p>

      <h2>What we collect</h2>
      <p>When you make a booking, we collect:</p>
      <ul>
        <li>Your name</li>
        <li>Your mobile phone number</li>
        <li>
          Your email address, if you choose to provide one (used only to send
          your booking confirmation and appointment reminder)
        </li>
        <li>
          Your booking details and history (the services, stylist, date and
          time you book)
        </li>
        <li>
          Any optional notes you choose to add to a booking (for example, a
          request or preference)
        </li>
        <li>
          Whether you agreed to hear from us about coming back (see
          "Offers and reminders to come back" below)
        </li>
      </ul>
      <p>
        When you visit, your stylist may also record, on your client record:
      </p>
      <ul>
        <li>
          <strong>Colour formulas</strong> — what was mixed and applied, so we
          can repeat it next time; and
        </li>
        <li>
          <strong>Patch tests</strong> — the product tested, the date, and
          whether your skin reacted. This relates to your health, so we treat
          it as sensitive information. We record it only to look after you
          safely, and only staff who need it can see it.
        </li>
      </ul>
      <p>
        We only collect what we need to look after you and manage your
        appointment. You don't need to create an account or give us anything
        else.
      </p>

      <h2>Why we collect it</h2>
      <p>
        We use your information to manage your bookings and deliver our
        services — confirming appointments, preparing for your visit, keeping
        a record of past visits so we can serve you better, and contacting you
        about a booking if we need to.
      </p>
      <p>
        <strong>
          We do not sell your personal information, and we do not use it for
          marketing without your consent.
        </strong>
      </p>

      <h2>Offers and reminders to come back</h2>
      <p>
        When you book, you can tick an optional box to say you'd like to hear
        from us about coming back. It is never ticked for you, and your
        booking is the same whether or not you tick it. If you tick it, and
        you haven't visited for a while, we may email you (or send a text
        message) inviting you to book again. We don't send these to anyone who
        hasn't agreed.
      </p>
      <p>
        Every one of these messages comes from Sua Hair Studio and includes a
        link to unsubscribe. Using it stops the invitations straight away;
        you'll still get messages about bookings you make. You can also ask us
        to stop by calling the salon or emailing{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>Where your information is stored</h2>
      <p>
        We store booking data using Google Firebase, a cloud service provided
        by Google. <strong>Google's servers may be located outside
        Australia</strong> (for example, in the United States or other
        countries). This means your personal information may be stored and
        processed overseas. We rely on Google's security and contractual
        protections for data held on its infrastructure, but we cannot
        guarantee that overseas laws are the same as Australian privacy law.
        We flag this to you because Australian Privacy Principle 8 requires us
        to tell you when your information may be disclosed overseas.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your information for as long as you are a client of the salon,
        so your visit history, colour formulas and patch tests stay available
        to us. We don't currently delete client records automatically after a
        set time; we keep them until you ask us to delete them or we remove
        them ourselves.
      </p>
      <p>
        When you ask us to delete your information (or we remove it ourselves),
        we delete your name, phone number, email address, notes, colour
        formulas and patch tests, and your client record. We may keep
        de-identified booking records (with your name and contact details
        removed) for our own business and financial history, where we're
        permitted or required to. If you unsubscribe from offers, we keep a
        record that you did, so that we don't contact you again.
      </p>

      <h2>Access, correction and deletion</h2>
      <p>
        You can ask us at any time to:
      </p>
      <ul>
        <li>see what personal information we hold about you;</li>
        <li>correct it if it's wrong; or</li>
        <li>delete it.</li>
      </ul>
      <p>
        To make a request, email us at{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We'll respond
        within a reasonable time. There's no charge to ask.
      </p>

      <h2>Keeping your information secure</h2>
      <p>
        We take reasonable steps to protect your information from loss, misuse
        and unauthorised access. Access to full customer records is limited to
        salon staff who are signed in to our booking system.
      </p>

      <h2>Contact us</h2>
      <p>
        If you have a question or concern about your privacy, or you'd like to
        make a request, email{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. If you're not
        satisfied with our response, you can contact the Office of the
        Australian Information Commissioner (OAIC) at oaic.gov.au.
      </p>
    </LegalPage>
  );
};

export default PrivacyPolicyPage;
