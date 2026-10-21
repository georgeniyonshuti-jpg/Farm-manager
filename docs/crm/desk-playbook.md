# Desk playbook

How staff handle one WhatsApp to 0796 683 323. The customer still sees that number. Staff reply from the shared inbox, not from a handset. Scouts do not get an inbox login in the pilot. They see only sellers assigned to them, under Assigned sellers.

This script is for rehearsal now. The automatic reply is not live until a staging CRM exists and Meta has marked the business Verified. Do not register 0796 683 323 on the API. That number is the live market line. Tests use Meta’s test number.

## Hours and speed

- Reply hours: 07:00–19:00, Monday–Saturday, Africa/Kigali.
- Outside those hours the only automatic line is: we reply at 07:00.
- One automatic welcome per lead per 24 hours. No second bot message the same day.
- During reply hours a person claims the lead within 5 minutes.
- At 5 minutes the supervisor is notified once.
- At 10 minutes the lead moves to the supervisor queue once.
- One owner replies. A supervisor can move the lead. Two people do not both answer.

If the customer sends STOP, stop all automatic messages and do not send a signup link.

## First message

Send this once. The customer’s reply picks the language. If they write in Kinyarwanda, stay in Kinyarwanda. If they write in English, stay in English.

### English

Welcome to Cleva. What do you want to do?

1. I have birds to sell
2. I want to buy birds
3. I want to work as a scout

Reply with 1, 2, or 3.

Outside hours, send only:

Thanks for writing to Cleva. We reply from 07:00 to 19:00, Monday to Saturday. We will answer at 07:00.

### Kinyarwanda

Murakaza neza kuri Cleva. Wifuza iki?

1. Ndagurisha inkoko
2. Ndashaka kugura inkoko
3. Ndashaka gukora nk'umushakashaka

Subiza 1, 2, cyangwa 3.

Outside hours, send only:

Murakoze kwandikira Cleva. Dusubiza kuva saa moya z'igitondo kugeza saa moya z'umugoroba, kuva ku wa mbere kugeza ku wa gatandatu. Tuzagusubiza saa moya z'igitondo.

## Four facts

Ask these after they pick 1, 2, or 3. One bubble is enough.

English:

What is your name? Which district are you in? How many birds? When?

Kinyarwanda:

Witwa nde? Uri mu karere kahe? Ni inkoko zingahe? Ryari?

The district must be a real Rwanda district, the same list as signup. If they name a village or a place you do not know, leave the district blank and put their words in the note. A person fixes it. Do not invent a district.

## After the facts

| They chose | You do | Then |
|---|---|---|
| 1 Seller | Call if the flock sounds real. Log the call: time, reached or not, what you agreed, next date. Send one signup link. | Assign one scout in that district. The handoff note is required. Example: "40 broilers, Gasabo, says ready next week, call before visiting." |
| 2 Buyer | Send one signup link. | They become a market lead. No scout. |
| 3 Scout | Short call. Send the scout signup link. | They apply in the app. Approve or reject them in Signups. |
| Not a fit, spam, or no answer after two tries | Close as rejected, spam, or unreachable. | No signup link and no scout. |

The signup link is single-use. If they sign up with a different phone, the link still matches the lead. Do not match on the phone number alone.

A seller does not appear on the public market from the chat. The scout visits, then review. The listing waits for that.

A call is a note. The CRM does not record the audio of a normal mobile call.

## Who sees what

- Desk (`sales_coordinator` and superuser): the inbox, every new lead, claim, signup link, assign, close.
- Scout: Assigned sellers only. Name, phone, district, birds, date, and the handoff note. They mark contacted, book the visit, and write the outcome.
- Buyer and seller accounts: no Messages button and no inbox.

## Not in the pilot

French messages, scout logins to the inbox, sending the lead straight to a scout before a person has claimed it, and call recording.
