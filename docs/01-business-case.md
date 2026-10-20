# Business Case

## Project

Sua Hair Studio — Booking & Management Platform

## Status

Built and tested against emulators; **not yet in use at the salon**. Pre-pilot — see `PILOT_READINESS.md` for what has been verified and what has not.

## Background

Sua Hair Studio is a Korean hair salon in Glen Waverley, Melbourne (VIC) with 5 active stylists across director, senior and junior tiers. Before this project, appointments arrived by phone call and SMS. Staff took each request and managed it by hand — checking availability and replying — **while they were also serving clients in the chair**. There was no booking system for customers and no shared, real-time view of the day for the owner.

The purpose of the platform is to take that booking admin off the staff so they can focus on their clients: customers book themselves, the system enforces the scheduling rules, and the owner only reviews and approves.

## Problem Statement

The existing manual process created the following business problems:

| Problem                                                                    | Business Impact                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Booking requests interrupt staff who are mid-service (calls and texts)     | Stylists' attention is split; calls go unanswered; clients in the chair are served less well                                                     |
| Double bookings when two requests arrive close together                    | Client dissatisfaction, lost revenue, reputational damage                                                                                        |
| No visibility across 5 stylists in real time                               | Owner unable to manage the floor without being physically present                                                                                |
| No client history or loyalty tracking                                      | Missed retention and upsell opportunities                                                                                                        |
| Bookings only possible while someone can answer the phone (business hours) | Revenue lost outside the 10am–6pm window                                                                                                         |
| Manual scheduling ignores service rest periods                             | Stylist capacity underutilised — colour treatments block a stylist for the full duration when they could take another client during setting time |
| Service prices managed informally                                          | No audit trail when prices change; historical revenue data inaccurate                                                                            |

## Goals

1. Allow customers to book appointments 24/7 without calling or texting
2. Remove routine booking admin from stylists so they can focus on the client in front of them
3. Give the owner real-time visibility across all stylists on a single screen
4. Prevent double bookings automatically via the scheduling engine (customer flow) and a conflict check (admin-created bookings)
5. Capture client history and enable loyalty recognition
6. Let the owner manage stylists, services, prices and opening hours without code changes
7. Preserve historical booking accuracy when prices or stylists change
8. Confirm and remind customers by email, and tell the owner when a booking arrives

## Success Metrics

These are the targets the pilot should measure (none has been measured yet):

- Zero double bookings in live use (compare the platform's day against what actually happened)
- Owner can approve / cancel / create bookings from a phone
- A customer can complete a booking in under 3 minutes
- Owner can add a service, change a price or close a date without developer involvement
- Fewer booking calls and texts handled by staff during service hours (count them during the pilot)

## Scope

**In scope (current build):**

- Online customer booking flow (no account), with optional email for confirmation and reminder emails
- Owner approval of online bookings (pending → confirmed)
- Admin dashboard: Today timeline, approvals, bookings list, client search and history, training sessions, analytics, and a Manage area for stylists, services, opening hours, per-stylist working hours and owner email notifications
- Waitlist for fully-booked days
- In-app notifications for the owner and stylists
- Stylist login with a read-only daily schedule
- Privacy consent, privacy policy / terms pages and customer data erasure (anonymisation)

**Out of scope:**

- SMS sending (the app only opens the owner's own messaging app with the text filled in; nothing is sent from the platform)
- Payment processing
- Customer accounts or login
- Multi-location support
- Staff payroll or commission tracking
