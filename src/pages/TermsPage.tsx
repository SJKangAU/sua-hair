// TermsPage.tsx
// Public terms of service at /terms. Plain-English draft covering who
// provides the service, the booking-as-request model, cancellation
// expectations, a limitation of liability, and governing law (Victoria,
// Australia).
//
// NOTE: This is a starting structure, not legal advice. It must be reviewed
// by a qualified Australian lawyer before commercial reliance — in
// particular, the limitation of liability must be read alongside the
// non-excludable consumer guarantees under the Australian Consumer Law.
// Placeholder: the registered business/legal name ([business name]).

import LegalPage from "../components/legal/LegalPage";

// Keep this in sync with any substantive content change below.
const LAST_UPDATED = "15 October 2026";

const TermsPage = () => {
  return (
    <LegalPage title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These terms apply when you book an appointment with Sua Hair Studio
        through this website. By making a booking, you agree to them. Please
        read them alongside our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Who provides the service</h2>
      <p>
        The salon services and this booking site are provided by [business
        name], trading as Sua Hair Studio, located in Glen Waverley, Victoria.
      </p>

      <h2>Bookings are requests</h2>
      <p>
        When you submit a booking, you're making a <strong>request</strong>{" "}
        for an appointment. Your appointment is not guaranteed until the salon
        confirms it. We may need to adjust or decline a booking — for example,
        if a stylist becomes unavailable or a time is no longer open — and
        we'll contact you if that happens.
      </p>

      <h2>Cancellations and changes</h2>
      <p>
        If you can't make your appointment, please let us know as early as you
        can so we can offer the time to someone else. We ask for reasonable
        notice for cancellations and changes. Repeated no-shows may affect
        our ability to hold future bookings for you.
      </p>

      <h2>Pricing</h2>
      <p>
        Prices shown at booking are estimates based on the services and
        stylist you select. The final price may vary depending on the service
        actually provided. We'll make any price difference clear to you at
        your appointment.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        We take care in providing our services, but to the extent permitted by
        law they are provided "as is". We are not liable for outcomes that
        depend on individual factors — for example, how a particular hair type
        responds to a service — or for indirect or consequential loss.
      </p>
      <p>
        <strong>Nothing in these terms excludes or limits any rights you
        have under the Australian Consumer Law</strong>, including the consumer
        guarantees that cannot be excluded. Where those guarantees apply, our
        liability is limited to re-supplying the service or paying the cost of
        having it re-supplied, where the law allows.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of Victoria, Australia, and the
        courts of Victoria have jurisdiction over any dispute arising from
        them.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about these terms? Call us on (03) 9569 0840 or visit us in
        Glen Waverley.
      </p>
    </LegalPage>
  );
};

export default TermsPage;
