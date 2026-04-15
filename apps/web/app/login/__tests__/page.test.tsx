import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import LoginPage from '../page';
import { loginUser } from '@/lib/api';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock API
jest.mock('@/lib/api', () => ({
  loginUser: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
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
      expect(screen.getByText('Email inválido')).toBeInTheDocument();
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

  it('validates password strength', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('tu@correo.com');
    const passwordInput = screen.getByPlaceholderText('Tu clave');

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'weak'); // Falta mayúscula y número

    const submitButton = screen.getByRole('button', { name: /Continuar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Debe contener una mayúscula')
      ).toBeInTheDocument();
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
      expect(mockPush).toHaveBeenCalledWith('/agent');
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
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
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
