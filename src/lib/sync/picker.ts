import type { PickResult } from './backend';

/**
 * The Google Picker (PLAN.md "Sharing flow" step 3). Under `drive.file` the app sees only the
 * files it created or that the parent picked for it, so a file another parent shared becomes
 * reachable only once the invited parent selects it here. The Picker is shown filtered to
 * that one file (`DocsView.setFileIds`), in an iframe on the page, never a popup.
 *
 * Loaded on demand from `apis.google.com`, like GIS: a device that never joins a family makes
 * no request to it. The developer key and the app id are public by design (PLAN.md "Security
 * and privacy"), restricted in Google Cloud to the Picker API and the app's referrers.
 */

const LOADER_URL = 'https://apis.google.com/js/api.js';

export const GOOGLE_API_KEY: string = import.meta.env.VITE_GOOGLE_API_KEY ?? '';
export const GOOGLE_APP_ID: string = import.meta.env.VITE_GOOGLE_APP_ID ?? '';

/** Whether this build carries what the Picker needs. */
export function isPickerConfigured(): boolean {
  return GOOGLE_API_KEY.trim().length > 0 && GOOGLE_APP_ID.trim().length > 0;
}

interface PickerResponse {
  action?: string;
  docs?: { id?: string }[];
}

interface Picker {
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  build(): Picker;
}

interface DocsView {
  setFileIds(ids: string): DocsView;
  setMode(mode: string): DocsView;
}

export interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  Feature: { NAV_HIDDEN: string };
  Action: { PICKED: string; CANCEL: string };
}

interface Gapi {
  load(name: string, options: { callback: () => void; onerror?: () => void }): void;
}

declare global {
  interface Window {
    gapi?: Gapi;
  }
}

/** `window.google` is shared with GIS; the Picker adds `google.picker` to it. */
const pickerNamespace = (): PickerNamespace | undefined =>
  (window.google as unknown as { picker?: PickerNamespace } | undefined)?.picker;

let loading: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
  loading ??= new Promise<PickerNamespace>((resolve, reject) => {
    const fail = (message: string) => {
      // A later tap retries from scratch: this one may simply have been offline.
      loading = null;
      reject(new Error(message));
    };
    const ready = () => {
      const picker = pickerNamespace();
      if (picker) resolve(picker);
      else fail('The Google Picker loaded without its API');
    };
    const loadModule = (gapi: Gapi) => gapi.load('picker', { callback: ready, onerror: () => fail('The Google Picker could not be loaded') });
    if (window.gapi) {
      loadModule(window.gapi);
      return;
    }
    const script = document.createElement('script');
    script.src = LOADER_URL;
    script.async = true;
    script.onload = () => (window.gapi ? loadModule(window.gapi) : fail('The Google API loader did not start'));
    script.onerror = () => fail('The Google API loader could not be loaded');
    document.head.append(script);
  });
  return loading;
}

/**
 * Show the Picker over the page, filtered to `fileId`, and say whether the parent picked it.
 * Closing the Picker, or picking anything else, is `cancelled`.
 */
export async function pickFile(fileId: string, accessToken: string): Promise<PickResult> {
  if (!isPickerConfigured()) throw new Error('This build has no Google Picker key');
  const picker = await loadPicker();
  return new Promise<PickResult>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS).setFileIds(fileId).setMode(picker.DocsViewMode.LIST);
    let shown: Picker | undefined;
    const done = (result: PickResult) => {
      shown?.dispose();
      resolve(result);
    };
    shown = new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.NAV_HIDDEN)
      .setAppId(GOOGLE_APP_ID)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOAuthToken(accessToken)
      .setOrigin(window.location.origin)
      .setLocale('pl')
      .setTitle('Wybierz plik wspólnej rodziny')
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) {
          done(response.docs?.some((doc) => doc.id === fileId) === true ? 'picked' : 'cancelled');
        } else if (response.action === picker.Action.CANCEL) {
          done('cancelled');
        }
      })
      .build();
    shown.setVisible(true);
  });
}
