export * from './enums';
export * from './countries';
export * from './phone';
export * from './schemas';

/**
 * Version of the terms and the privacy policy. Raise it whenever either text changes in a way
 * that affects users: everyone is then asked to agree again before they can carry on.
 */
export const LEGAL_VERSION = '2026-09-24';

/** Version of the privacy notice guardians accept when adding a child (PLAN §14). */
export const PRIVACY_POLICY_VERSION = LEGAL_VERSION;

export * from './schools';
export * from './trip-rules';
export * from './notification-templates';
