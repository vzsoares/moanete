/**
 * Base class for moanete custom elements.
 * Light DOM only — inherits host page styles (Tailwind + DaisyUI).
 */
export abstract class MoaneteElement extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  /** Override to set innerHTML and bind events. */
  abstract render(): void;

  /** Scoped querySelector shorthand. */
  protected $<T extends HTMLElement>(selector: string): T {
    return this.querySelector<T>(selector)!;
  }

  /** Scoped querySelectorAll shorthand. */
  protected $$<T extends HTMLElement>(selector: string): NodeListOf<T> {
    return this.querySelectorAll<T>(selector);
  }

  /** Dispatch a typed CustomEvent. */
  protected emit<T>(name: string, detail?: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}
