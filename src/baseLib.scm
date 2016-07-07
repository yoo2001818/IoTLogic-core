; module.exports = `

(define (device-exists device)
  (exists (lambda (n) (eq? device n)) (device-list))
)

; `;
