#!/bin/sh

# TZ=UTC in order to have consistent date handling regardless of server locale
TZ=UTC node scripts/migrations/add-free-ticket-for-each-membership-before-2017.js
TZ=UTC node scripts/migrations/add-free-ticket-for-activity-before-2017.js
TZ=UTC node scripts/migrations/migrate-abos-to-subscriptions.js
TZ=UTC node scripts/migrations/verify-member-tickets.js
