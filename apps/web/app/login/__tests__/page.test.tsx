import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import LoginPage from '../page';
import { getSessionInfo, loginUser } from '@/lib/api/cliente';
import { ApiHttpError } from '@/lib/api/envelope';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock API
jest.mock('@/lib/api/cliente', () => ({
  loginUser: jest.fn(),
  getSessionInfo: jest.fn(),
}));

// Mock Zustand store
jest.mock('@/state/session.store', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      setAuthenticated: jest.fn(),
    }),
}));

describe('LoginPage', () => {
  const mockPush = jest.fn();
  const mockLoginUser = loginUser as jest.MockedFunction<typeof loginUser>;
  const mockGetSessionInfo = getSessionInfo as jest.MockedFunction<typeof getSessionInfo>;
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    mockGetSessionInfo.mockResolvedValue({
      id: 'session-1',
      injectedIntake: {
        intake: {
          employmentStatus: 'employed',
          incomeBand: '600k-1M',
        },
      },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: jest.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders login form', () => {
    render(<LoginPage />);
    expect(screen.getByText('Bienvenido de vuelta')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('tu@correo.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tu clave')).toBeInTheDocument();
  });

  it('shows validation errors for invalid input', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email requerido')).toBeInTheDocument();
    });
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    await user.type(emailInput, 'invalid-email');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email inválido')).toBeInTheDocument();
    });
  });

  it('requires password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');

    await user.type(emailInput, 'test@example.com');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Contraseña requerida')).toBeInTheDocument();
    });
  });

  it('submits valid form and navigates', async () => {
    const user = userEvent.setup();
    mockLoginUser.mockResolvedValue({ user: { id: '123', name: 'Test' } });

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    const passwordInput = screen.getByPlaceholderText('Tu clave');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLoginUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123',
      });
      expect(window.location.assign).toHaveBeenCalledWith('/agent');
    });
  });

  it('redirects admin user to admin panel', async () => {
    const user = userEvent.setup();
    mockLoginUser.mockResolvedValue({ user: { id: 'admin-1', name: 'Admin', role: 'ADMIN' } });

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'admin@example.com');
    await user.type(screen.getByPlaceholderText('Tu clave'), 'Password123');
    await user.click(screen.getByRole('button', { name: /Continuar/i }));

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith('/admin');
    });
  });

  it('redirects to next param when present', async () => {
    const user = userEvent.setup();
    const { useSearchParams } = jest.requireMock('next/navigation') as {
      useSearchParams: jest.Mock;
    };
    useSearchParams.mockReturnValue(new URLSearchParams('next=/intake'));
    mockLoginUser.mockResolvedValue({ user: { id: '123', name: 'Test' } });

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Tu clave'), 'Password123');
    await user.click(screen.getByRole('button', { name: /Continuar/i }));

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith('/intake');
    });
  });

  it('shows error on login failure', async () => {
    const user = userEvent.setup();
    mockLoginUser.mockRejectedValue(new Error('Invalid credentials'));

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    const passwordInput = screen.getByPlaceholderText('Tu clave');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas. Revisa tu correo y contraseña.')).toBeInTheDocument();
    });
  });

  it('redirects to waiting approval when account is pending', async () => {
    const user = userEvent.setup();
    mockLoginUser.mockRejectedValue(
      new ApiHttpError({
        status: 403,
        code: 'ACCOUNT_PENDING_APPROVAL',
        message: 'Cuenta pendiente de aprobación',
      })
    );

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('tu@correo.com'), 'pending@example.com');
    await user.type(screen.getByPlaceholderText('Tu clave'), 'Password123');
    await user.click(screen.getByRole('button', { name: /Continuar/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('/waiting-approval?')
      );
    });
  });

  it('disables button while loading', async () => {
    const user = userEvent.setup();
    mockLoginUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ user: {} }), 1000))
    );

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    const passwordInput = screen.getByPlaceholderText('Tu clave');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123');

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
  });

  it('submits on Enter key press', async () => {
    const user = userEvent.setup();
    mockLoginUser.mockResolvedValue({ user: { id: '123', name: 'Test' } });

    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    const passwordInput = screen.getByPlaceholderText('Tu clave');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'Password123{Enter}');

    await waitFor(() => {
      expect(mockLoginUser).toHaveBeenCalled();
    });
  });
});
