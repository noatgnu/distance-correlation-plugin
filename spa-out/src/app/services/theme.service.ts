import { Injectable, signal, effect, computed } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';
export type ColorTheme = 'azure' | 'teal' | 'purple' | 'rose' | 'orange' | 'green' | 'cyber';

export interface ColorThemeDefinition {
  id: ColorTheme;
  displayName: string;
  previewLight: string;
  previewDark: string;
}

export const COLOR_THEMES: Record<ColorTheme, ColorThemeDefinition> = {
  azure: { id: 'azure', displayName: 'Azure', previewLight: '#1976d2', previewDark: '#64b5f6' },
  teal: { id: 'teal', displayName: 'Teal', previewLight: '#009688', previewDark: '#4db6ac' },
  purple: { id: 'purple', displayName: 'Purple', previewLight: '#7b1fa2', previewDark: '#ba68c8' },
  rose: { id: 'rose', displayName: 'Rose', previewLight: '#c2185b', previewDark: '#f48fb1' },
  orange: { id: 'orange', displayName: 'Orange', previewLight: '#e65100', previewDark: '#ffb74d' },
  green: { id: 'green', displayName: 'Green', previewLight: '#2e7d32', previewDark: '#81c784' },
  cyber: { id: 'cyber', displayName: 'Cyber', previewLight: '#0077be', previewDark: '#ffb400' }
};

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  theme = signal<Theme>('system');
  isDark = signal<boolean>(false);
  colorTheme = signal<ColorTheme>('azure');

  availableColorThemes = computed(() => Object.values(COLOR_THEMES));

  constructor() {
    this.loadFromLocalStorage();
    this.setupEffects();
    this.initializeSystemThemeListener();
  }

  private loadFromLocalStorage(): void {
    const savedTheme = localStorage.getItem('spa-theme') as Theme || 'system';
    this.theme.set(savedTheme);
    this.applyTheme(savedTheme);

    const savedColorTheme = localStorage.getItem('spa-color-theme') as ColorTheme;
    if (savedColorTheme && COLOR_THEMES[savedColorTheme]) {
      this.colorTheme.set(savedColorTheme);
      this.applyColorTheme(savedColorTheme);
    }
  }

  private setupEffects(): void {
    effect(() => {
      const theme = this.theme();
      this.applyTheme(theme);
      localStorage.setItem('spa-theme', theme);
    });

    effect(() => {
      const colorTheme = this.colorTheme();
      this.applyColorTheme(colorTheme);
      localStorage.setItem('spa-color-theme', colorTheme);
    });
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  setColorTheme(colorTheme: ColorTheme): void {
    this.colorTheme.set(colorTheme);
  }

  toggleTheme(): void {
    const current = this.theme();
    if (current === 'light') {
      this.setTheme('dark');
    } else if (current === 'dark') {
      this.setTheme('system');
    } else {
      this.setTheme('light');
    }
  }

  private applyTheme(theme: Theme): void {
    const isDark = this.resolveTheme(theme);
    this.isDark.set(isDark);

    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(isDark ? 'dark-theme' : 'light-theme');
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  private applyColorTheme(colorTheme: ColorTheme): void {
    document.body.setAttribute('data-color-theme', colorTheme);
  }

  private resolveTheme(theme: Theme): boolean {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return theme === 'dark';
  }

  private initializeSystemThemeListener(): void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    mediaQuery.addEventListener('change', (e) => {
      if (this.theme() === 'system') {
        this.isDark.set(e.matches);
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(e.matches ? 'dark-theme' : 'light-theme');
        document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }

  getThemeIcon(): string {
    const theme = this.theme();
    if (theme === 'light') return 'light_mode';
    if (theme === 'dark') return 'dark_mode';
    return 'brightness_auto';
  }

  getThemeLabel(): string {
    const theme = this.theme();
    if (theme === 'light') return 'Light mode';
    if (theme === 'dark') return 'Dark mode';
    return 'System theme';
  }

  getColorThemePreview(theme: ColorThemeDefinition): string {
    return this.isDark() ? theme.previewDark : theme.previewLight;
  }
}
