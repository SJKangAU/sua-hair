# Stakeholder Requirements

What each group of people needs from the platform, written from the point of view of the person who has it. Each requirement points at the functional requirement (`04`), non-functional requirement (`05`) or test scenario (`08`) that covers it.

> **Provenance.** These requirements are reconstructed from the business case (`01`), the process maps (`03`), the behaviour of the built system and the project history. They have **not** been re-validated with the salon staff or customers in this pass. Treat them as a checklist to confirm with the owner at the start of the pilot — items marked **(confirm)** are inferences.

## Stakeholders

| Stakeholder                      | Who                                                                                  | Relationship to the system                                                            | Main interest                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Owner / director                 | Steve Hwang (director stylist, trainer, runs the salon)                              | Signs in to the admin dashboard; approves bookings; sets prices, hours and staff      | A full, trustworthy view of the day; no double bookings; less admin      |
| Stylists (senior / junior)       | Yuto Hirakawa, Elly Lee (senior); Ethan Le, Harry Yang (junior)                      | Sign in to a read-only schedule; are booked by customers and the owner                | Know their day without being interrupted; not be double-booked           |
| Customers                        | Walk-in clients, regulars, new clients (Korean and English speaking **(confirm)**)   | Use the public booking page; no account                                               | Book any time, quickly, on a phone; know it is booked; privacy           |
| Salon staff handling the phone   | Whoever is free when a call/SMS arrives                                              | Still receive some bookings by phone/SMS during the pilot; may create walk-ins        | Booking someone in must be fast and must not clash with the system       |
| Developer / maintainer           | Project author                                                                       | Deploys, fixes, extends                                                               | Safe to change; tests prove it works; clear docs                         |

## Owner requirements

| ID     | Requirement                                                                                                          | Covered by                  |
| ------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| OWN-01 | See every active stylist's day side by side, live, for any date                                                      | FR-003; TC-009, TC-010      |
| OWN-02 | Review and approve (or decline / suggest another time for) each online booking before it is final                    | FR-009; TC-015, SMOKE       |
| OWN-03 | Create a walk-in or block out time in seconds, and never accidentally overwrite or double-book an existing booking   | FR-003, FR-013; TC-013, TC-014, TC-033 |
| OWN-04 | Undo a cancellation, and be stopped from restoring one whose slot has since been taken                              | FR-004, FR-013; TC-011      |
| OWN-05 | Move a booking to another time or stylist (drag on the timeline or from the booking), with the price following the new stylist's tier | FR-003                      |
| OWN-06 | Search any client by name or number and see their history, visits and spend                                          | FR-005; TC-021 to TC-024    |
| OWN-07 | Add / edit / deactivate stylists and services, and change prices, without a developer — with a price audit trail     | FR-008; TC-028 to TC-032    |
| OWN-08 | Set weekly opening hours, close or special-open individual dates, and set each stylist's working hours               | FR-008, FR-002; TC-036      |
| OWN-09 | Be told when an online booking arrives (in the app, and optionally by email)                                         | FR-011, FR-012; TC-035      |
| OWN-10 | Track after-hours training sessions without them appearing on the customer timeline                                  | FR-006; TC-025 to TC-027    |
| OWN-11 | See revenue and busiest-service / stylist figures that exclude cancelled, no-show, break and training time           | FR-007                      |
| OWN-12 | Do all of the above from a phone                                                                                     | NFR-USE-02                  |
| OWN-13 | Erase a customer's personal data on request while keeping the salon's financial history                              | FR-014; NFR-PRIV-04         |
| OWN-14 | Offer a waitlisted client a freed slot                                                                               | FR-010; TC-034              |

## Stylist requirements

| ID     | Requirement                                                                              | Covered by            |
| ------ | ---------------------------------------------------------------------------------------- | --------------------- |
| STY-01 | See only my own bookings for a chosen day, read-only                                     | FR-015                |
| STY-02 | Be told about a new booking assigned to me                                               | FR-011                |
| STY-03 | Not be booked outside my working hours, or while I am hands-on with another client      | FR-002; TC-006, TC-007 |
| STY-04 | Be bookable by another client while a colour is setting, if the new service fits         | FR-002; TC-006         |
| STY-05 | See how long a client's processing time has left, so I know when to return to them       | FR-003 (rest-period countdown) |

## Customer requirements

| ID     | Requirement                                                                                          | Covered by             |
| ------ | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| CUS-01 | Book at any hour without calling, on a phone, without creating an account                            | FR-001; TC-001         |
| CUS-02 | Choose one or several services and see how long they take and what they cost for my chosen stylist   | FR-001; TC-005         |
| CUS-03 | Choose a specific stylist or "any available"                                                         | FR-001                 |
| CUS-04 | Only be offered times that are actually free; see why others are not (greyed out, not hidden)         | FR-002; TC-007, TC-008 |
| CUS-05 | Not be able to book a closed day or a time that is too soon                                          | FR-002; TC-003, TC-004 |
| CUS-06 | Finish a booking in under 3 minutes                                                                  | NFR-PERF-04 (to be measured in the pilot) |
| CUS-07 | Get a confirmation I can add to my calendar, and a reminder before the appointment                    | FR-001, FR-012         |
| CUS-08 | Join a waitlist when my day is full                                                                  | FR-010; TC-034         |
| CUS-09 | Know my details are protected: consent is asked for, my data is not visible to other visitors        | FR-014; NFR-PRIV-01..03 |
| CUS-10 | Know whether my booking is actually confirmed or still waiting for the salon **(confirm — see open question below)** | FR-001, FR-009         |

## Phone / front-of-desk staff requirements

| ID     | Requirement                                                                                          | Covered by                  |
| ------ | ---------------------------------------------------------------------------------------------------- | --------------------------- |
| FOH-01 | Take a booking by phone using the same screen, quickly                                               | FR-003; TC-012, TC-013      |
| FOH-02 | Be told immediately, with the clashing booking named, if the time is already taken                   | FR-013; TC-033              |
| FOH-03 | Find an existing client by typing the start of their name or their number                            | FR-005; TC-021              |

## Developer requirements

| ID     | Requirement                                                                              | Covered by                  |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------- |
| DEV-01 | Every business rule lives in one place and is covered by tests                           | DEC-005, DEC-020; NFR-MNT-01 |
| DEV-02 | Security rules are tested against a real emulator, not just read                         | NFR-SEC-05                  |
| DEV-03 | The user-facing scenarios can be re-run automatically against the emulators              | NFR-MNT-03                  |
| DEV-04 | Docs match the code                                                                      | this document set           |

## Open questions for the owner (to settle before or during the pilot)

1. **Confirmation wording.** After booking online, the customer is told "Your booking is confirmed", but the booking is stored as *pending* until the owner approves it, and the confirmation email says the same. Should the wording change to "request received — we'll confirm shortly", or should online bookings be auto-confirmed?
2. **Booking by phone.** During the pilot, should phone/SMS bookings be entered by staff in the dashboard, or left to the old process and compared afterwards?
3. **Cancellation and change policy** for customers (the platform has no customer-side cancel).
4. **Languages.** Is a Korean-language booking page needed?
