// src/config/auth.ts
export const GOOGLE_CONFIG = {
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
};
  
export const JWT_CONFIG = {
    accessTokenSecret: process.env.JWT_ACCESS_TOKEN_SECRET || 'your-access-token-secret',
    refreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || 'your-refresh-token-secret',
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d'
};
  
export const BCRYPT_ROUNDS = 10;

