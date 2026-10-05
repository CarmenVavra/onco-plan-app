export interface PersonName {
  firstName: string;
  lastName: string;
}

export const fullName = (p: PersonName): string => `${p.firstName} ${p.lastName}`;

/** "Dr. Lena Brandt" */
export const doctorFullName = (p: PersonName): string => `Dr. ${fullName(p)}`;

/** "Dr. L. Brandt" */
export const doctorShortName = (p: PersonName): string => `Dr. ${p.firstName.charAt(0)}. ${p.lastName}`;

/** "LB" */
export const initials = (p: PersonName): string =>
  `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
