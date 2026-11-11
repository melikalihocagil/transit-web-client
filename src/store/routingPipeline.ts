import axios from 'axios';
import { routeApi } from '../api';
import type { Stop, Via, RouteNavigation } from '../model';

export interface RoutingPipelineCallbacks {
  onStart?: () => void;
  onSuccess: (navigation: RouteNavigation) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}

/**
 * Asenkron Rota Hesaplama ve Ağ Pipeline'ı (Madde 5).
 *
 * Temel Mühendislik Standartları:
 * 1. Mikro-Debounce (200ms): Ardışık hızlı işlemleri (peş peşe via oynatma, durak sıralama)
 *    tek bir istekte birleştirerek ağ bombardımanını önler.
 * 2. Yarış Koşulu Koruması (AbortController): Yeni bir hesaplama geldiğinde önceki
 *    uçuşta (in-flight) olan HTTP isteğini anında keser (stale data overwrite önlenir).
 * 3. Hata İzolasyonu: Abort iptalleri (CanceledError) sessizce yönetilir, uygulama akışını bozmaz.
 */
class RoutingPipeline {
  private abortController: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs = 200) {
    this.debounceMs = debounceMs;
  }

  /**
   * Yeni bir rota hesaplama talebi planlar.
   * - Bekleyen önceki debounce sayacını sıfırlar.
   * - Halihazırda devam eden HTTP isteğini AbortController ile anında iptal eder.
   * - 200ms sonra backend /api/routing/calculate ucunu tetikler.
   */
  public schedule(
    stops: Stop[],
    vias: Via[],
    callbacks: RoutingPipelineCallbacks
  ): void {
    // 1. Önceki debounce sayacını sıfırla
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // 2. Uçuşta olan önceki HTTP isteğini anında kes
    if (this.abortController !== null) {
      this.abortController.abort();
      this.abortController = null;
    }

    // En az 2 durak yoksa OSRM güzergahı hesaplanamaz
    if (stops.length < 2) {
      callbacks.onSettled?.();
      return;
    }

    // 3. Mikro-debounce zamanlayıcısını başlat
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;

      const controller = new AbortController();
      this.abortController = controller;

      callbacks.onStart?.();

      try {
        const navigation = await routeApi.calculateRouting(stops, vias, controller.signal);

        // İstek iptal edilmediyse ve halen geçerli olan controller buysa store'a aktar
        if (!controller.signal.aborted && this.abortController === controller) {
          callbacks.onSuccess(navigation);
        }
      } catch (err: unknown) {
        // İptal edilen istekler normal yaşam döngüsüdür
        if (axios.isCancel(err) || controller.signal.aborted) {
          return;
        }

        const error = err instanceof Error ? err : new Error('Güzergah OSRM rotalaması hesaplanamadı');
        callbacks.onError?.(error);
      } finally {
        if (this.abortController === controller) {
          this.abortController = null;
          callbacks.onSettled?.();
        }
      }
    }, this.debounceMs);
  }

  /**
   * Tüm bekleyen zamanlayıcıları ve uçuşta olan HTTP isteklerini derhal iptal eder.
   */
  public cancel(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.abortController !== null) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export const routingPipeline = new RoutingPipeline(200);
