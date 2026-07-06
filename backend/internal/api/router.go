package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"calculator-backend/internal/api/handler"
	"calculator-backend/internal/api/middleware"
)

// NewRouter builds the fully wired Gin engine for the calculator API,
// including the health check used by container orchestration to detect
// readiness.
func NewRouter() *gin.Engine {
	r := gin.Default()
	r.Use(middleware.CORS())

	// Registered for both GET and HEAD: health-check tooling (wait-on,
	// curl -I, container orchestrators) commonly probes with HEAD, and Gin
	// does not implicitly answer HEAD for a route only registered via GET.
	healthCheck := func(c *gin.Context) {
		c.Status(http.StatusOK)
	}
	r.GET("/healthz", healthCheck)
	r.HEAD("/healthz", healthCheck)

	calculationHandler := handler.NewCalculationHandler()
	v1 := r.Group("/api/v1")
	v1.POST("/calculations", calculationHandler.Create)

	return r
}
