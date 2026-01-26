#!/bin/sh

node scripts/migrations/add-free-ticket-for-each-membership-before-2017.js
node scripts/migrations/add-free-ticket-for-activity-before-2017.js
node scripts/migrations/migrate-abos-to-subscriptions.js
node scripts/migrations/verify-member-tickets.js
