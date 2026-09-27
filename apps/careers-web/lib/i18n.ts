export const supportedLocales=["en-GB","ne-NP"] as const;
export type CareersLocale=typeof supportedLocales[number];
export const messages={
 "en-GB":{careers:"Careers",openRoles:"Open roles",apply:"Apply",portal:"My Raeburn",alerts:"Job alerts"},
 "ne-NP":{careers:"करियर",openRoles:"खुला पदहरू",apply:"आवेदन दिनुहोस्",portal:"मेरो Raeburn",alerts:"रोजगारी सूचना"}
} as const;
export function message(locale:string,key:keyof typeof messages["en-GB"]){const l=(supportedLocales as readonly string[]).includes(locale)?locale as CareersLocale:"en-GB";return messages[l][key]||messages["en-GB"][key];}