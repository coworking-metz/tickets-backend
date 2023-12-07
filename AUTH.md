# Authentication

How to retrieve a refresh token:
- Foward users to `tickets-backend/api/auth/login`,
- Users will authenticate themself on `https://www.coworking-metz.fr/`,
- If authorized, users will be redirected to the origin
with `accessToken` and `refreshToken` as query parameters.

By default, `tickets-backend` will set the origin url to the `Referer` request header
when forwarding users to `tickets-backend/api/auth/login`.
It can be overriden by setting the `follow` query parameter.

Some examples:
- when users navigate to `tickets-backend/api/auth/login` from `http://your-app.local`, they will be redirected to `http://localhost:5173` if `http://localhost:5173` is included in `OAUTH_FOLLOW_WHITELIST` environement variable, otherwise to `tickets-backend/api/auth/callback` with an error message.
- when users navigate to `tickets-backend/api/auth/login?follow=http://example.com` from `http://localhost:5173`, they will be redirected to `http://example.com` if `http://example.com` is included in `OAUTH_FOLLOW_WHITELIST` environement variable, otherwise to `tickets-backend/api/auth/callback` with an error message.

Here is a sequence diagram on how it works behind the scene:
```mermaid
sequenceDiagram
    User->>app: click on login
    app-->>User: forward to tickets-backend/api/auth/login
    User->>tickets-backend: GET /api/auth/login
    tickets-backend-->>User: redirect to wordpress/oauth/authorize?redirect=tickets-backend
    User->>wordpress: GET /oauth/authorize?redirect=tickets-backend
    wordpress-->>User: redirect to /mon-compte
    User->>wordpress: POST /mon-compte { credentials }
    wordpress->>wordpress: check credentials
    wordpress-->>User: redirect to tickets-backend/api/auth/callback?code
    User->>tickets-backend: GET /api/auth/callback?code
    tickets-backend->>wordpress: POST /oauth/token { code }
    wordpress-->>tickets-backend: { OAuthAccessToken, OAuthRefreshToken }
    tickets-backend->>wordpress: POST /oauth/me { OAuthAccessToken }
    wordpress-->>tickets-backend: { id, email, roles… }
    tickets-backend->>tickets-backend: encode OAuthRefreshToken in JWT refreshToken and build JWT accessToken
    tickets-backend-->>User: redirect to app/?accessToken&refreshToken
```

# Authorization

How to retrieve an access token:
- Check if you have a refresh token, otherwise [authenticate](#authentication),
- Make a POST HTTP request to `tickets-backend/api/auth/tokens` with the `refreshToken` in the body in the JSON format.
```bash
curl -X POST -H "Content-Type: application/json"  -d '{"refreshToken":"USER_REFRESH_TOKEN"}' http://tickets-backend/api/auth/tokens
```
- You will receive:
  - `accessToken`: used to authorize HTTP request made to private endpoints,
  - `refreshToken`: used to retrieve new tokens,
  - `user`: informations about the user.

How it works behind the scene:
```mermaid
sequenceDiagram
    User->>app: GET /?refreshToken
    app-->>app: check if refreshToken exists
    app->>tickets-backend: POST /api/auth/token { refreshToken }
    tickets-backend->>tickets-backend: decode OAuthRefreshToken from refreshToken
    tickets-backend->>wordpress: POST /oauth/token { OAuthRefreshToken }
    wordpress-->>tickets-backend: { OAuthAccessToken, OAuthRefreshToken }
    tickets-backend->>wordpress: POST /oauth/me { OAuthAccessToken }
    wordpress-->>tickets-backend: { id, email, roles… }
    tickets-backend->>tickets-backend: encode OAuthRefreshToken in JWT refreshToken and build JWT accessToken
    tickets-backend-->>app: { accessToken, refreshToken }
    app-->>User: redirect to /home
```
