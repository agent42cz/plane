/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
// icons
import { Eye, EyeOff, Info, XCircle } from "lucide-react";
// plane imports
import { API_BASE_URL, E_PASSWORD_STRENGTH, AUTH_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { Input, PasswordStrengthIndicator, Spinner } from "@plane/ui";
import { getPasswordStrength } from "@plane/utils";
// components
import { ForgotPasswordPopover } from "@/components/account/auth-forms/forgot-password-popover";
// constants
// helpers
import { EAuthModes, EAuthSteps } from "@/helpers/authentication.helper";
// services
import { AuthService } from "@/services/auth.service";

type Props = {
  email: string;
  isSMTPConfigured: boolean;
  mode: EAuthModes;
  handleEmailClear: () => void;
  handleAuthStep: (step: EAuthSteps) => void;
  nextPath: string | undefined;
  // When true this form is shown as the initial combined login (email + password on
  // one screen, single submit) instead of being reached after a separate email step.
  // The email field becomes editable so password managers can fill the whole login at once.
  emailEditable?: boolean;
};

type TPasswordFormValues = {
  email: string;
  password: string;
  confirm_password?: string;
};

const defaultValues: TPasswordFormValues = {
  email: "",
  password: "",
};

const authService = new AuthService();

export const AuthPasswordForm = observer(function AuthPasswordForm(props: Props) {
  const { email, isSMTPConfigured, handleAuthStep, handleEmailClear, mode, nextPath, emailEditable = false } = props;
  // plane imports
  const { t } = useTranslation();
  // ref
  const formRef = useRef<HTMLFormElement>(null);
  // states
  const [csrfPromise, setCsrfPromise] = useState<Promise<{ csrf_token: string }> | undefined>(undefined);
  const [passwordFormData, setPasswordFormData] = useState<TPasswordFormValues>({ ...defaultValues, email });
  const [showPassword, setShowPassword] = useState({
    password: false,
    retypePassword: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordInputFocused, setIsPasswordInputFocused] = useState(false);
  const [isRetryPasswordInputFocused, setIsRetryPasswordInputFocused] = useState(false);
  const [isBannerMessage, setBannerMessage] = useState(false);

  const handleShowPassword = (key: keyof typeof showPassword) =>
    setShowPassword((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFormChange = (key: keyof TPasswordFormValues, value: string) =>
    setPasswordFormData((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (csrfPromise === undefined) {
      const promise = authService.requestCSRFToken();
      setCsrfPromise(promise);
    }
  }, [csrfPromise]);

  // Password managers (1Password, Bitwarden, browser autofill) fill a field by writing
  // `input.value` directly. React keeps its own value tracker, so a direct write followed
  // by a plain `input` event never reaches React state: the submit button stays disabled
  // and the hidden `email` field this form actually submits stays empty. Native listeners
  // on the form see those events regardless of React's tracker, so sync state from the DOM.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const readField = (name: keyof TPasswordFormValues) =>
      form.querySelector<HTMLInputElement>(`input[name="${name === "email" ? "username" : name}"]`) ??
      form.querySelector<HTMLInputElement>(`#${name === "confirm_password" ? "confirm-password" : name}`);

    const syncField = (key: keyof TPasswordFormValues, value: string) =>
      setPasswordFormData((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));

    const syncFromEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      // the visible email input is named `username` in combined mode (see below)
      const key = target.name === "username" ? "email" : target.name;
      if (key !== "email" && key !== "password" && key !== "confirm_password") return;
      syncField(key, target.value);
    };

    // a filler may have written the fields before this effect attached
    for (const key of ["email", "password", "confirm_password"] as const) {
      const field = readField(key);
      if (field && field.value) syncField(key, field.value);
    }

    form.addEventListener("input", syncFromEvent);
    form.addEventListener("change", syncFromEvent);
    return () => {
      form.removeEventListener("input", syncFromEvent);
      form.removeEventListener("change", syncFromEvent);
    };
  }, []);

  // Last-resort backstop for fillers that write values without firing any event at all:
  // the form submits the hidden `email` input, so copy the visible field into it on submit.
  const handleHiddenEmailSync = () => {
    const form = formRef.current;
    if (!form) return;
    const visibleEmail = form.querySelector<HTMLInputElement>("#email");
    const hiddenEmail = form.querySelector<HTMLInputElement>('input[type="hidden"][name="email"]');
    if (visibleEmail && hiddenEmail && visibleEmail.value) hiddenEmail.value = visibleEmail.value;
  };

  const redirectToUniqueCodeSignIn = async () => {
    handleAuthStep(EAuthSteps.UNIQUE_CODE);
  };

  const passwordSupport =
    mode === EAuthModes.SIGN_IN ? (
      <div className="w-full">
        {isSMTPConfigured ? (
          <Link
            data-ph-element={AUTH_TRACKER_ELEMENTS.FORGOT_PASSWORD_FROM_SIGNIN}
            href={`/accounts/forgot-password?email=${encodeURIComponent(email)}`}
            className="text-11 font-medium text-accent-primary"
          >
            {t("auth.common.forgot_password")}
          </Link>
        ) : (
          <ForgotPasswordPopover />
        )}
      </div>
    ) : (
      passwordFormData.password.length > 0 &&
      getPasswordStrength(passwordFormData.password) != E_PASSWORD_STRENGTH.STRENGTH_VALID && (
        <PasswordStrengthIndicator password={passwordFormData.password} isFocused={isPasswordInputFocused} />
      )
    );

  const isButtonDisabled = useMemo(
    () =>
      !isSubmitting &&
      !!passwordFormData.password &&
      (emailEditable ? !!passwordFormData.email : true) &&
      (mode === EAuthModes.SIGN_UP ? passwordFormData.password === passwordFormData.confirm_password : true)
        ? false
        : true,
    [
      isSubmitting,
      mode,
      emailEditable,
      passwordFormData.email,
      passwordFormData.confirm_password,
      passwordFormData.password,
    ]
  );

  const password = passwordFormData?.password ?? "";
  const confirmPassword = passwordFormData?.confirm_password ?? "";
  const renderPasswordMatchError = !isRetryPasswordInputFocused || confirmPassword.length >= password.length;

  const handleCSRFToken = async () => {
    if (!formRef || !formRef.current) return;
    const token = await csrfPromise;
    if (!token?.csrf_token) return;
    const csrfElement = formRef.current.querySelector("input[name=csrfmiddlewaretoken]");
    csrfElement?.setAttribute("value", token?.csrf_token);
  };

  return (
    <>
      {isBannerMessage && mode === EAuthModes.SIGN_UP && (
        <div className="relative flex items-center gap-2 rounded-md border border-danger-strong/50 bg-danger-subtle p-2">
          <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <Info size={16} className="text-danger-primary" />
          </div>
          <div className="w-full text-13 font-medium text-danger-primary">
            {t("auth.sign_up.errors.password.strength")}
          </div>
          <button
            type="button"
            className="relative ml-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs text-accent-primary/80 transition-all hover:bg-danger-subtle-hover"
            onClick={() => setBannerMessage(false)}
          >
            <CloseIcon className="h-4 w-4 shrink-0 text-danger-primary" />
          </button>
        </div>
      )}
      <form
        ref={formRef}
        className="space-y-4"
        method="POST"
        action={`${API_BASE_URL}/auth/${mode === EAuthModes.SIGN_IN ? "sign-in" : "sign-up"}/`}
        onSubmit={async (event) => {
          event.preventDefault(); // Prevent form from submitting by default
          await handleCSRFToken();
          handleHiddenEmailSync();
          const isPasswordValid =
            mode === EAuthModes.SIGN_UP
              ? getPasswordStrength(passwordFormData.password) === E_PASSWORD_STRENGTH.STRENGTH_VALID
              : true;
          if (isPasswordValid) {
            setIsSubmitting(true);
            if (formRef.current) formRef.current.submit(); // Manually submit the form if the condition is met
          } else {
            setBannerMessage(true);
          }
        }}
        onError={() => {
          setIsSubmitting(false);
        }}
      >
        <input type="hidden" name="csrfmiddlewaretoken" />
        <input type="hidden" value={passwordFormData.email} name="email" />
        {nextPath && <input type="hidden" value={nextPath} name="next_path" />}
        <div className="space-y-1">
          <label htmlFor="email" className="text-13 font-medium text-tertiary">
            {t("auth.common.email.label")}
          </label>
          <div className={`relative flex items-center rounded-md border border-strong bg-surface-1`}>
            <Input
              id="email"
              // In combined mode use a plain username field (not type=email / name=email) so the
              // browser's own email-history dropdown doesn't hijack the field and hide 1Password's
              // login suggestion. The value is still submitted via the hidden `email` field above.
              name={emailEditable ? "username" : "email"}
              type={emailEditable ? "text" : "email"}
              inputMode="email"
              value={passwordFormData.email}
              onChange={(e) => handleFormChange("email", e.target.value)}
              placeholder={t("auth.common.email.placeholder")}
              className={`h-10 w-full border-0 disable-autofill-style placeholder:text-placeholder`}
              autoComplete="username"
              disabled={!emailEditable}
            />
            {passwordFormData.email.length > 0 && (
              <button
                type="button"
                className="absolute right-3 size-5"
                onClick={handleEmailClear}
                aria-label={t("aria_labels.auth_forms.clear_email")}
              >
                <XCircle className="size-5 stroke-placeholder" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-13 font-medium text-tertiary">
            {mode === EAuthModes.SIGN_IN ? t("auth.common.password.label") : t("auth.common.password.set_password")}
          </label>
          <div className="relative flex items-center rounded-md bg-surface-1">
            <Input
              type={showPassword?.password ? "text" : "password"}
              id="password"
              name="password"
              value={passwordFormData.password}
              onChange={(e) => handleFormChange("password", e.target.value)}
              placeholder={t("auth.common.password.placeholder")}
              className="h-10 w-full border border-strong !bg-surface-1 pr-12 disable-autofill-style placeholder:text-placeholder"
              onFocus={() => setIsPasswordInputFocused(true)}
              onBlur={() => setIsPasswordInputFocused(false)}
              autoComplete={mode === EAuthModes.SIGN_IN ? "current-password" : "new-password"}
              autoFocus
            />
            <button
              type="button"
              onClick={() => handleShowPassword("password")}
              className="absolute right-3 grid size-5 place-items-center"
              aria-label={t(
                showPassword?.password ? "aria_labels.auth_forms.hide_password" : "aria_labels.auth_forms.show_password"
              )}
            >
              {showPassword?.password ? (
                <EyeOff className="size-5 stroke-placeholder" />
              ) : (
                <Eye className="size-5 stroke-placeholder" />
              )}
            </button>
          </div>
          {passwordSupport}
        </div>

        {mode === EAuthModes.SIGN_UP && (
          <div className="space-y-1">
            <label htmlFor="confirm-password" className="text-13 font-medium text-tertiary">
              {t("auth.common.password.confirm_password.label")}
            </label>
            <div className="relative flex items-center rounded-md bg-surface-1">
              <Input
                type={showPassword?.retypePassword ? "text" : "password"}
                id="confirm-password"
                name="confirm_password"
                value={passwordFormData.confirm_password}
                onChange={(e) => handleFormChange("confirm_password", e.target.value)}
                placeholder={t("auth.common.password.confirm_password.placeholder")}
                className="h-10 w-full border border-strong !bg-surface-1 pr-12 disable-autofill-style placeholder:text-placeholder"
                onFocus={() => setIsRetryPasswordInputFocused(true)}
                onBlur={() => setIsRetryPasswordInputFocused(false)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 grid size-5 place-items-center"
                aria-label={t(
                  showPassword?.retypePassword
                    ? "aria_labels.auth_forms.hide_password"
                    : "aria_labels.auth_forms.show_password"
                )}
                onClick={() => handleShowPassword("retypePassword")}
              >
                {showPassword?.retypePassword ? (
                  <EyeOff className="size-5 stroke-placeholder" />
                ) : (
                  <Eye className="size-5 stroke-placeholder" />
                )}
              </button>
            </div>
            {!!passwordFormData.confirm_password &&
              passwordFormData.password !== passwordFormData.confirm_password &&
              renderPasswordMatchError && (
                <span className="text-13 text-danger-primary">{t("auth.common.password.errors.match")}</span>
              )}
          </div>
        )}

        <div className="space-y-2.5">
          {mode === EAuthModes.SIGN_IN ? (
            <>
              <Button type="submit" variant="primary" className="w-full" size="xl" disabled={isButtonDisabled}>
                {isSubmitting ? (
                  <Spinner height="20px" width="20px" />
                ) : isSMTPConfigured ? (
                  t("common.continue")
                ) : (
                  t("common.go_to_workspace")
                )}
              </Button>
              {isSMTPConfigured && (
                <Button
                  type="button"
                  data-ph-element={AUTH_TRACKER_ELEMENTS.SIGN_IN_WITH_UNIQUE_CODE}
                  onClick={redirectToUniqueCodeSignIn}
                  variant="secondary"
                  className="w-full"
                  size="xl"
                >
                  {t("auth.common.sign_in_with_unique_code")}
                </Button>
              )}
            </>
          ) : (
            <Button type="submit" variant="primary" className="w-full" size="xl" disabled={isButtonDisabled}>
              {isSubmitting ? <Spinner height="20px" width="20px" /> : "Create account"}
            </Button>
          )}
        </div>
      </form>
    </>
  );
});
