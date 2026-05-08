import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

// ─── QR Menü ───

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products').then(r => r.data),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data),
  });
}

export function useMedia() {
  return useQuery({
    queryKey: ['media'],
    queryFn: () => api.get('/media').then(r => r.data),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });
}

// ─── Akademi ───

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get('/academy/courses').then(r => r.data),
  });
}

export function useCourse(courseId) {
  return useQuery({
    queryKey: ['course', courseId],
    queryFn: () => api.get(`/academy/courses/${courseId}`).then(r => r.data),
    enabled: !!courseId,
  });
}

export function useLessons(courseId) {
  return useQuery({
    queryKey: ['lessons', courseId],
    queryFn: () => api.get(`/academy/lessons?courseId=${courseId}`).then(r => r.data),
    enabled: !!courseId,
  });
}

// ─── Genel Mutation Helper ───

/**
 * Mutation sonrası ilgili cache'leri invalidate eder
 * @param {string[]} queryKeys - Invalidate edilecek query key'leri
 */
export function useInvalidatingMutation(mutationFn, queryKeys = []) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    },
  });
}
