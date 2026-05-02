// 로그인 / 회원가입 페이지
import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const loginSchema = z.object({
  username: z.string().min(1, "아이디를 입력해주세요"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});

const registerSchema = z.object({
  username: z.string().min(3, "아이디는 3자 이상이어야 합니다").max(20, "아이디는 20자 이하여야 합니다"),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
  nickname: z.string().min(1, "닉네임을 입력해주세요").max(20, "닉네임은 20자 이하여야 합니다"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onLogin = async (data: LoginForm) => {
    try {
      const result = await loginMutation.mutateAsync({ data });
      login(result.token as string);
      setLocation("/lobby");
    } catch (err: any) {
      toast({
        title: "로그인 실패",
        description: err.response?.data?.error || "아이디 또는 비밀번호가 틀렸습니다",
        variant: "destructive",
      });
    }
  };

  const onRegister = async (data: RegisterForm) => {
    try {
      const result = await registerMutation.mutateAsync({ data });
      login(result.token as string);
      setLocation("/lobby");
    } catch (err: any) {
      toast({
        title: "회원가입 실패",
        description: err.response?.data?.error || "회원가입에 실패했습니다",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen dreamcore-bg flex items-center justify-center p-4 overflow-hidden">
      {/* 배경 장식 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-600/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-cyan-500/8 blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        {/* 헤더 */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-block"
          >
            <h1 className="text-4xl font-bold text-glow text-primary tracking-tight mb-2">
              드림코어
            </h1>
            <p className="text-lg font-medium text-foreground/80">미로 타이쿤</p>
            <p className="text-sm text-muted-foreground mt-1">무한히 이어지는 리미널 스페이스</p>
          </motion.div>
        </div>

        {/* 폼 카드 */}
        <div className="glass-strong rounded-2xl p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-2 w-full mb-6 bg-muted/50">
              <TabsTrigger value="login" data-testid="tab-login">로그인</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">회원가입</TabsTrigger>
            </TabsList>

            <AnimatePresence>
              <TabsContent value="login" key="login">
                <motion.form
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={loginForm.handleSubmit(onLogin)}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-username">아이디</Label>
                    <Input
                      id="login-username"
                      data-testid="input-login-username"
                      placeholder="아이디를 입력하세요"
                      {...loginForm.register("username")}
                    />
                    {loginForm.formState.errors.username && (
                      <p className="text-destructive text-xs">{loginForm.formState.errors.username.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">비밀번호</Label>
                    <Input
                      id="login-password"
                      data-testid="input-login-password"
                      type="password"
                      placeholder="비밀번호를 입력하세요"
                      {...loginForm.register("password")}
                    />
                    {loginForm.formState.errors.password && (
                      <p className="text-destructive text-xs">{loginForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    data-testid="button-login-submit"
                    className="w-full glow-purple"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "로그인 중..." : "로그인"}
                  </Button>
                </motion.form>
              </TabsContent>

              <TabsContent value="register" key="register">
                <motion.form
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={registerForm.handleSubmit(onRegister)}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">아이디</Label>
                    <Input
                      id="reg-username"
                      data-testid="input-register-username"
                      placeholder="3~20자 아이디"
                      {...registerForm.register("username")}
                    />
                    {registerForm.formState.errors.username && (
                      <p className="text-destructive text-xs">{registerForm.formState.errors.username.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-nickname">닉네임</Label>
                    <Input
                      id="reg-nickname"
                      data-testid="input-register-nickname"
                      placeholder="게임에 표시될 닉네임"
                      {...registerForm.register("nickname")}
                    />
                    {registerForm.formState.errors.nickname && (
                      <p className="text-destructive text-xs">{registerForm.formState.errors.nickname.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">비밀번호</Label>
                    <Input
                      id="reg-password"
                      data-testid="input-register-password"
                      type="password"
                      placeholder="6자 이상"
                      {...registerForm.register("password")}
                    />
                    {registerForm.formState.errors.password && (
                      <p className="text-destructive text-xs">{registerForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    data-testid="button-register-submit"
                    className="w-full glow-purple"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? "가입 중..." : "시작하기"}
                  </Button>
                </motion.form>
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground/50 mt-4">
          첫 번째 가입자는 마스터 관리자가 됩니다
        </p>
      </motion.div>
    </div>
  );
}
