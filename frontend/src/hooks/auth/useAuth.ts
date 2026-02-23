import { useUserSystem } from '../../components/ConfigProvider';

export function useAuth() {
  const { loginStatus, sharedApiBase, config } = useUserSystem();
  const remoteEnabled =
    !!sharedApiBase && config?.remote_onboarding_acknowledged === true;
  const isSignedIn = remoteEnabled && loginStatus?.status === 'loggedin';
  const userId =
    isSignedIn && loginStatus?.status === 'loggedin'
      ? loginStatus.profile.user_id
      : null;

  return {
    isSignedIn,
    isLoaded: loginStatus !== null,
    userId,
  };
}
