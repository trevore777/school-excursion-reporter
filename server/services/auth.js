import * as msal from '@azure/msal-node';
const scopes=['openid','profile','offline_access','User.Read','Files.ReadWrite'];
function requireConfig(){for(const k of['MICROSOFT_TENANT_ID','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','MICROSOFT_REDIRECT_URI'])if(!process.env[k])throw new Error(`Microsoft sign-in is not configured: ${k} is missing.`)}
function cca(){requireConfig();return new msal.ConfidentialClientApplication({auth:{clientId:process.env.MICROSOFT_CLIENT_ID,authority:`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,clientSecret:process.env.MICROSOFT_CLIENT_SECRET}})}
export async function loginUrl(){return cca().getAuthCodeUrl({scopes,redirectUri:process.env.MICROSOFT_REDIRECT_URI})}
export async function redeem(code){return cca().acquireTokenByCode({code,scopes,redirectUri:process.env.MICROSOFT_REDIRECT_URI})}
