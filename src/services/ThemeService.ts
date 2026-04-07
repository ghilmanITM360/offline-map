/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AppTheme {
  background: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  primary: string;
  primaryLight: string;
  accent: string;
  danger: string;
  placeholder: string;
  chip: string;
  chipActive: string;
  chipText: string;
  chipActiveText: string;
  mapButton: string;
  searchBar: string;
}

export const LIGHT_THEME: AppTheme = {
  background: '#F8F9FA',
  card: '#FFFFFF',
  text: '#202124',
  subtext: '#5F6368',
  border: '#DADCE0',
  primary: '#2E7D32',
  primaryLight: '#E8F5E9',
  accent: '#1A73E8',
  danger: '#D32F2F',
  placeholder: '#70757A',
  chip: '#FFFFFF',
  chipActive: '#E8F0FE',
  chipText: '#3C4043',
  chipActiveText: '#1A73E8',
  mapButton: '#FFFFFF',
  searchBar: '#FFFFFF',
};

export const DARK_THEME: AppTheme = {
  background: '#121212',
  card: '#1E1E1E',
  text: '#E8EAED',
  subtext: '#9AA0A6',
  border: '#3C4043',
  primary: '#81C784',
  primaryLight: '#1B3A1F',
  accent: '#8AB4F8',
  danger: '#EF5350',
  placeholder: '#9AA0A6',
  chip: '#2D2D2D',
  chipActive: '#174EA6',
  chipText: '#E8EAED',
  chipActiveText: '#8AB4F8',
  mapButton: '#2D2D2D',
  searchBar: '#2D2D2D',
};
