# react-native-helpers

# API
1. ApiPreCheck.js: Checks auth token expiry before every api call and renews token
2. ApiPostCheck.js: Checks auth token expiry status in api response to renew token and retry
3. ApiPrePostCheck.js: Checks auth token expiry before every api call and after checks it in the api response before renewing the token and retrying

Each API method already includes, automatic retries, exponential backoffs, exponential timeout increase.
